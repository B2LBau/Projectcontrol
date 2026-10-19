// Directe pushberichten bij nieuwe meldingen, toewijzingen, statuswijzigingen en chatberichten.
// Wordt aangeroepen door database-triggers (zie migratie *_notifications.sql) met de service-role sleutel.
import { adminClient, isInternalCall, json } from '../_shared/clients.ts';
import { type PushMessage, sendPush } from '../_shared/push.ts';
import { canSeeItem, type DirMember, type ItemRow, projectMembers, withRoles } from '../_shared/recipients.ts';
import { ITEM_TYPE_INFO } from '../_shared/types.ts';

type Payload =
  | { kind: 'item_created'; id: string }
  | { kind: 'item_owner'; id: string }
  | { kind: 'item_status'; id: string; actor_id: string | null; from: string | null; to: string }
  | { kind: 'message'; id: string };

const REVIEWERS = ['uitvoerder', 'werkverantwoordelijke'];
const URGENT_ROLES = ['uitvoerder', 'werkverantwoordelijke', 'projectleider'];

function label(type: string): string {
  return ITEM_TYPE_INFO[type as keyof typeof ITEM_TYPE_INFO]?.label ?? type;
}

function without(ids: (string | null | undefined)[], exclude: string | null | undefined): string[] {
  return [...new Set(ids.filter((x): x is string => !!x && x !== exclude))];
}

async function itemMessages(p: Payload, item: ItemRow, members: DirMember[]): Promise<PushMessage[]> {
  const visible = (ids: string[]) =>
    ids.filter((id) => {
      const m = members.find((x) => x.user_id === id);
      return !!m && canSeeItem(m, item);
    });
  const data = { item_id: item.id, project_id: item.project_id };
  const head = `${label(item.type)} ${item.number}`;
  const out: PushMessage[] = [];

  if (p.kind === 'item_created') {
    if (item.owner_id && item.owner_id !== item.created_by) {
      out.push({ userIds: [item.owner_id], title: `${head} aan jou toegewezen`, body: item.title, data });
    }
    const urgent =
      item.severity === 'kritiek' ||
      (item.severity === 'hoog' && (item.type === 'constatering' || item.type === 'afwijking'));
    if (urgent) {
      out.push({
        userIds: without(withRoles(members, URGENT_ROLES, item), item.created_by),
        title: `${item.severity === 'kritiek' ? 'KRITIEK' : 'Urgent'}: ${head}`,
        body: item.title,
        data,
        urgent: true,
      });
    }
    if (item.type === 'gereedmelding') {
      out.push({
        userIds: without(withRoles(members, REVIEWERS, item), item.created_by),
        title: `Gereedmelding ter beoordeling ${item.number}`,
        body: item.title,
        data,
      });
    }
  } else if (p.kind === 'item_owner') {
    if (item.owner_id) out.push({ userIds: [item.owner_id], title: `${head} aan jou toegewezen`, body: item.title, data });
  } else if (p.kind === 'item_status') {
    const extra =
      (item.type === 'afwijking' && p.to === 'hersteld') || (item.type === 'gereedmelding' && p.to === 'ingediend')
        ? withRoles(members, REVIEWERS, item)
        : [];
    out.push({
      userIds: visible(without([item.created_by, item.owner_id, ...extra], p.actor_id)),
      title: `${head}: ${p.to.replace(/_/g, ' ')}`,
      body: item.title,
      data,
    });
  }
  return out.filter((m) => m.userIds.length > 0);
}

Deno.serve(async (req) => {
  if (!isInternalCall(req)) return json({ error: 'Niet toegestaan' }, 401);
  const p = (await req.json()) as Payload;
  const admin = adminClient();

  if (p.kind === 'message') {
    const { data: msg } = await admin
      .from('messages')
      .select('id, channel_id, sender_id, kind, body, channels(id, name, kind, project_id, organisation_id, projects(code))')
      .eq('id', p.id)
      .single();
    if (!msg) return json({ sent: 0 });
    // deno-lint-ignore no-explicit-any
    const ch = (msg as any).channels;
    const members = await projectMembers(admin, ch.project_id);
    let ids: string[];
    if (ch.kind === 'algemeen') ids = members.map((m) => m.user_id);
    else if (ch.kind === 'intern') ids = members.filter((m) => m.organisation_kind === 'eigen').map((m) => m.user_id);
    else if (ch.kind === 'oa')
      ids = members
        .filter((m) => m.organisation_kind === 'eigen' || m.organisation_id === ch.organisation_id)
        .map((m) => m.user_id);
    else {
      const { data: cm } = await admin.from('channel_members').select('user_id').eq('channel_id', ch.id);
      ids = (cm ?? []).map((r) => r.user_id);
    }
    const sender = members.find((m) => m.user_id === msg.sender_id)?.full_name ?? 'Iemand';
    const preview =
      msg.kind === 'foto' ? '📷 Foto' : msg.kind === 'spraak' ? '🎤 Spraakbericht' : (msg.body ?? '').slice(0, 140);
    const sent = await sendPush(admin, [
      {
        userIds: without(ids, msg.sender_id),
        title: `${sender} · ${ch.projects?.code ?? ''} ${ch.name}`,
        body: preview,
        data: { channel_id: ch.id, project_id: ch.project_id },
      },
    ]);
    return json({ sent });
  }

  const { data: item } = await admin.from('items').select('*').eq('id', p.id).single();
  if (!item) return json({ sent: 0 });
  const members = await projectMembers(admin, item.project_id);
  const sent = await sendPush(admin, await itemMessages(p, item as ItemRow, members));
  return json({ sent });
});
