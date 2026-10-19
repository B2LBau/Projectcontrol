// Termijnbewaking (FO §5.13): herinneringen vóór/op/na de termijn, escalatie en dagelijkse samenvatting.
// Draait elk kwartier via pg_cron (zie migratie *_notifications.sql).
import { adminClient, isInternalCall, json } from '../_shared/clients.ts';
import { bucketFor, isQuietTime, type ReminderKind, reminderSchedule } from '../_shared/deadlines.ts';
import { claimOnce, type PushMessage, sendPush } from '../_shared/push.ts';
import { canSeeItem, type DirMember, type ItemRow, projectMembers, withRoles } from '../_shared/recipients.ts';
import type { Severity } from '../_shared/types.ts';
import { amsterdamParts, isWorkday } from '../_shared/workdays.ts';

/** Herinneringen die langer dan dit geleden hadden moeten gaan, slaan we over. */
const LOOKBACK_MS = 3 * 24 * 3600 * 1000;
const DIGEST_HOUR = 7;

const TEXT: Record<ReminderKind, string> = {
  voor: 'Termijn over 2 werkdagen',
  op_dag: 'Termijn vandaag',
  na: 'Termijn verstreken',
  escalatie: 'Escalatie: termijn ruim verstreken',
};

/** Escalatieketen: intern → projectleider; OA → uitvoerder eigen team en uitvoerder OA. */
function escalationTargets(members: DirMember[], item: ItemRow): string[] {
  const owner = members.find((m) => m.user_id === item.owner_id);
  if (!owner || owner.organisation_kind === 'eigen') return withRoles(members, ['projectleider'], item);
  return [
    ...withRoles(members, ['uitvoerder'], item),
    ...members
      .filter((m) => m.role === 'oa_uitvoerder' && m.organisation_id === owner.organisation_id && m.user_id !== owner.user_id)
      .map((m) => m.user_id),
  ];
}

Deno.serve(async (req) => {
  if (!isInternalCall(req)) return json({ error: 'Niet toegestaan' }, 401);
  const admin = adminClient();
  const now = new Date();

  const { data: items, error } = await admin
    .from('items')
    .select('*, projects(code)')
    .is('closed_at', null)
    .not('due_at', 'is', null)
    .not('owner_id', 'is', null);
  if (error) return json({ error: error.message }, 500);

  const membersByProject = new Map<string, DirMember[]>();
  const getMembers = async (projectId: string) => {
    if (!membersByProject.has(projectId)) membersByProject.set(projectId, await projectMembers(admin, projectId));
    return membersByProject.get(projectId)!;
  };

  const msgs: PushMessage[] = [];
  for (const item of (items ?? []) as (ItemRow & { projects: { code: string } })[]) {
    if (isQuietTime(now, item.severity as Severity)) continue;
    const due = new Date(item.due_at!);
    const pending = reminderSchedule(due, new Date(item.created_at)).filter(
      (r) => r.at.getTime() <= now.getTime() && now.getTime() - r.at.getTime() < LOOKBACK_MS,
    );
    // Alleen de meest recente herinnering versturen als er meerdere tegelijk openstaan.
    const r = pending[pending.length - 1];
    if (!r) continue;
    if (!(await claimOnce(admin, `item:${item.id}:${r.kind}:${item.due_at}`))) continue;

    const members = await getMembers(item.project_id);
    const data = { item_id: item.id, project_id: item.project_id };
    if (r.kind === 'escalatie') {
      const owner = members.find((m) => m.user_id === item.owner_id)?.full_name ?? 'eigenaar';
      msgs.push({
        userIds: escalationTargets(members, item),
        title: `${TEXT.escalatie} – ${item.number}`,
        body: `${item.title} (eigenaar: ${owner})`,
        data,
        urgent: item.severity === 'kritiek',
      });
    } else {
      msgs.push({
        userIds: [item.owner_id!],
        title: `${TEXT[r.kind]} – ${item.number}`,
        body: item.title,
        data,
        urgent: item.severity === 'kritiek',
      });
    }
  }

  // Dagelijkse samenvatting om 07:00 op werkdagen (FO: te laat, vandaag, deze week)
  const nl = amsterdamParts(now);
  if (isWorkday(nl.date) && nl.hour === DIGEST_HOUR) {
    const perUser = new Map<string, { te_laat: number; vandaag: number; deze_week: number }>();
    for (const item of (items ?? []) as ItemRow[]) {
      const members = await getMembers(item.project_id);
      const owner = members.find((m) => m.user_id === item.owner_id);
      if (!owner || !canSeeItem(owner, item)) continue;
      const b = bucketFor(new Date(item.due_at!), now);
      if (b !== 'te_laat' && b !== 'vandaag' && b !== 'deze_week') continue;
      const c = perUser.get(owner.user_id) ?? { te_laat: 0, vandaag: 0, deze_week: 0 };
      c[b]++;
      perUser.set(owner.user_id, c);
    }
    for (const [userId, c] of perUser) {
      if (!(await claimOnce(admin, `digest:${userId}:${nl.date}`))) continue;
      msgs.push({
        userIds: [userId],
        title: 'Jouw taken vandaag',
        body: `${c.te_laat} te laat · ${c.vandaag} vandaag · ${c.deze_week} deze week`,
        data: { screen: 'taken' },
      });
    }
  }

  const sent = await sendPush(admin, msgs);
  return json({ checked: items?.length ?? 0, sent });
});
