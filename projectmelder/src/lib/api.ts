// Toegang tot Supabase. Lezen gaat direct; wijzigingen aan meldingen lopen via
// databasefuncties zodat elke wijziging in de audit trail komt.
import type {
  Attachment,
  Channel,
  Item,
  ItemEvent,
  ItemType,
  Meeting,
  Member,
  Message,
  Organisation,
  Profile,
  Project,
  Role,
  Severity,
  Visibility,
} from '../domain/types';
import type { Suggestion, SuggestMember } from '../domain/suggest';
import { suggestLocally } from '../domain/suggest';
import { supabase } from './supabase';

function check<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ---------------------------------------------------------------- profiel en organisatie

export async function getProfile(userId: string): Promise<Profile | null> {
  const res = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return check(res);
}

export async function updateProfile(userId: string, fields: { full_name: string; job_title: string | null }) {
  check(await supabase.from('profiles').update(fields).eq('id', userId));
}

export async function claimInvites(): Promise<number> {
  return check(await supabase.rpc('claim_invites')) ?? 0;
}

export async function getOrganisations(): Promise<Organisation[]> {
  return check(await supabase.from('organisations').select('*').order('name')) ?? [];
}

export async function bootstrapOrganisation(name: string): Promise<string> {
  return check(await supabase.rpc('bootstrap_organisation', { p_name: name }));
}

export async function createOrganisation(name: string, kind: Organisation['kind']): Promise<string> {
  return check(await supabase.rpc('create_organisation', { p_name: name, p_kind: kind }));
}

export async function requestAccess(projectCode: string, note: string) {
  check(await supabase.rpc('request_access', { p_code: projectCode, p_note: note }));
}

export type AccessRequest = { id: string; phone: string; full_name: string; project_code: string; note: string | null; created_at: string };

export async function getAccessRequests(projectCode: string): Promise<AccessRequest[]> {
  return (
    check(
      await supabase
        .from('access_requests')
        .select('id, phone, full_name, project_code, note, created_at')
        .eq('project_code', projectCode)
        .eq('status', 'open')
        .order('created_at'),
    ) ?? []
  );
}

export async function declineAccessRequest(id: string) {
  check(await supabase.rpc('decline_access_request', { p_id: id }));
}

// ---------------------------------------------------------------- projecten en leden

export async function getProjects(): Promise<Project[]> {
  return check(await supabase.from('projects').select('id, code, name, client, location, created_at').order('code')) ?? [];
}

export async function createProject(p: { code: string; name: string; client: string; location: string; role: Role }) {
  return check<string>(
    await supabase.rpc('create_project', {
      p_code: p.code,
      p_name: p.name,
      p_client: p.client,
      p_location: p.location,
      p_role: p.role,
    }),
  );
}

export async function getMembers(projectId: string): Promise<Member[]> {
  return (
    check(
      await supabase
        .from('member_directory')
        .select('*')
        .eq('project_id', projectId)
        .eq('active', true)
        .order('full_name'),
    ) ?? []
  );
}

export async function inviteMember(p: { projectId: string; phone: string; name: string; role: Role; orgId: string }) {
  check(
    await supabase.rpc('invite_member', {
      p_project: p.projectId,
      p_phone: p.phone,
      p_name: p.name,
      p_role: p.role,
      p_org: p.orgId,
    }),
  );
}

export async function getInvites(projectId: string) {
  return (
    check(
      await supabase
        .from('invites')
        .select('id, phone, full_name, role, accepted_at, organisations(name)')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
    ) ?? []
  );
}

export function toSuggestMembers(members: Member[]): SuggestMember[] {
  return members.map((m) => ({
    user_id: m.user_id,
    full_name: m.full_name,
    role: m.role,
    organisation_name: m.organisation_name,
  }));
}

// ---------------------------------------------------------------- kanalen en berichten

export async function getChannels(projectId: string): Promise<Channel[]> {
  return check(await supabase.from('channels').select('*').eq('project_id', projectId).order('created_at')) ?? [];
}

export async function getChannel(id: string): Promise<Channel | null> {
  return check(await supabase.from('channels').select('*').eq('id', id).maybeSingle());
}

export async function getMessages(channelId: string, before?: string): Promise<Message[]> {
  let q = supabase.from('messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: false }).limit(50);
  if (before) q = q.lt('created_at', before);
  return (check(await q) ?? []).reverse();
}

export async function lastMessages(channelIds: string[]): Promise<Record<string, Message>> {
  const out: Record<string, Message> = {};
  await Promise.all(
    channelIds.map(async (id) => {
      const res = await supabase
        .from('messages')
        .select('*')
        .eq('channel_id', id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (res.data) out[id] = res.data as Message;
    }),
  );
  return out;
}

export async function retractMessage(id: string) {
  check(await supabase.rpc('message_retract', { p_message: id }));
}

// ---------------------------------------------------------------- meldingen

export type ItemFilter = {
  projectId: string;
  types?: ItemType[];
  open?: boolean;
  ownerId?: string;
  createdBy?: string;
  search?: string;
  meetingId?: string;
  overdue?: boolean;
};

export async function getItems(f: ItemFilter): Promise<Item[]> {
  let q = supabase.from('items').select('*').eq('project_id', f.projectId);
  if (f.types?.length) q = q.in('type', f.types);
  if (f.open === true) q = q.is('closed_at', null);
  if (f.open === false) q = q.not('closed_at', 'is', null);
  if (f.ownerId) q = q.eq('owner_id', f.ownerId);
  if (f.createdBy) q = q.eq('created_by', f.createdBy);
  if (f.meetingId) q = q.eq('meeting_id', f.meetingId);
  if (f.overdue) q = q.lt('due_at', new Date().toISOString());
  if (f.search?.trim()) {
    const s = f.search.trim().replace(/[%,()]/g, ' ');
    q = q.or(`title.ilike.%${s}%,description.ilike.%${s}%,transcript.ilike.%${s}%,number.ilike.%${s}%,location_label.ilike.%${s}%`);
  }
  return check(await q.order('created_at', { ascending: false }).limit(500)) ?? [];
}

/** Alles wat aan mij is toegewezen of op mijn beoordeling wacht, over alle projecten. */
export async function getMyTasks(userId: string): Promise<Item[]> {
  const owned = check(await supabase.from('items').select('*').eq('owner_id', userId).is('closed_at', null)) ?? [];
  const waiting =
    check(
      await supabase
        .from('items')
        .select('*')
        .eq('created_by', userId)
        .in('status', ['gereed_gemeld', 'beantwoord', 'hersteld'])
        .is('closed_at', null),
    ) ?? [];
  const seen = new Set<string>();
  return [...owned, ...waiting].filter((i) => (seen.has(i.id) ? false : (seen.add(i.id), true)));
}

export async function getItem(id: string): Promise<Item | null> {
  return check(await supabase.from('items').select('*').eq('id', id).maybeSingle());
}

export async function getItemEvents(id: string): Promise<ItemEvent[]> {
  return check(await supabase.from('item_events').select('*').eq('item_id', id).order('at')) ?? [];
}

export async function getAttachments(filter: { itemId?: string; messageIds?: string[] }): Promise<Attachment[]> {
  let q = supabase.from('attachments').select('*');
  if (filter.itemId) q = q.eq('item_id', filter.itemId);
  if (filter.messageIds) {
    if (filter.messageIds.length === 0) return [];
    q = q.in('message_id', filter.messageIds);
  }
  return check(await q.order('captured_at')) ?? [];
}

export type NewItem = {
  id: string;
  project_id: string;
  type: ItemType;
  title: string;
  description: string | null;
  transcript: string | null;
  severity: Severity;
  owner_id: string | null;
  due_at: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  captured_at: string;
  visibility: Visibility;
  labels: string[];
  meeting_id: string | null;
  source_message_id: string | null;
  parent_item_id: string | null;
  details: Record<string, unknown>;
  ai_fields: string[];
};

/** Idempotent: een tweede poging met hetzelfde id (offline wachtrij) is geen fout. */
export async function insertItem(item: NewItem) {
  const { error } = await supabase.from('items').insert(item);
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function insertMessage(m: {
  id: string;
  channel_id: string;
  sender_id: string;
  kind: Message['kind'];
  body: string | null;
  transcript: string | null;
  item_id: string | null;
  captured_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
}) {
  const { error } = await supabase.from('messages').insert(m);
  if (error && error.code !== '23505') throw new Error(error.message);
}

export async function setStatus(itemId: string, status: string, note?: string) {
  check(await supabase.rpc('item_set_status', { p_item: itemId, p_status: status, p_note: note ?? null }));
}

export async function setDue(itemId: string, due: string | null, reason: string) {
  check(await supabase.rpc('item_set_due', { p_item: itemId, p_due: due, p_reason: reason }));
}

export async function setOwner(itemId: string, ownerId: string | null) {
  check(await supabase.rpc('item_set_owner', { p_item: itemId, p_owner: ownerId }));
}

export async function updateFields(
  itemId: string,
  f: { title: string; description: string | null; location_label: string | null; severity: Severity; labels: string[] },
) {
  check(
    await supabase.rpc('item_update_fields', {
      p_item: itemId,
      p_title: f.title,
      p_description: f.description,
      p_location_label: f.location_label,
      p_severity: f.severity,
      p_labels: f.labels,
    }),
  );
}

export async function addComment(itemId: string, body: string) {
  check(await supabase.rpc('item_comment', { p_item: itemId, p_body: body }));
}

export async function withdrawItem(itemId: string, reason: string) {
  check(await supabase.rpc('item_withdraw', { p_item: itemId, p_reason: reason }));
}

// ---------------------------------------------------------------- AI-voorstel

/** AI-voorstel via de server; valt terug op lokale regels (offline of bij een fout). */
export async function suggest(
  projectId: string,
  text: string,
  members: Member[],
  typeHint?: ItemType,
): Promise<Suggestion[]> {
  try {
    const { data, error } = await supabase.functions.invoke('suggest', {
      body: { project_id: projectId, text, type_hint: typeHint },
    });
    if (error) throw error;
    const list = (data?.suggestions ?? []) as Suggestion[];
    if (list.length) return list;
  } catch {
    // val terug op lokaal voorstel
  }
  return [suggestLocally(text, toSuggestMembers(members), new Date(), typeHint)];
}

// ---------------------------------------------------------------- overleggen

export async function getMeetings(projectId: string): Promise<Meeting[]> {
  return check(await supabase.from('meetings').select('*').eq('project_id', projectId).order('starts_at', { ascending: false })) ?? [];
}

export async function getMeeting(id: string): Promise<Meeting | null> {
  return check(await supabase.from('meetings').select('*').eq('id', id).maybeSingle());
}

export async function createMeeting(m: { project_id: string; title: string; kind: string; location: string | null }) {
  return check<{ id: string }>(await supabase.from('meetings').insert(m).select('id').single()).id;
}

export async function closeMeeting(id: string, attendees: { user_id: string; present: boolean }[]) {
  check(await supabase.rpc('meeting_close', { p_meeting: id, p_attendees: attendees }));
}

// ---------------------------------------------------------------- push

export async function registerPushToken(token: string, platform: string) {
  check(await supabase.rpc('register_push_token', { p_token: token, p_platform: platform }));
}
