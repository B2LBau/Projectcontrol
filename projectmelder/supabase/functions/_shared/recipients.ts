import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

export type DirMember = {
  user_id: string;
  role: string;
  organisation_id: string | null;
  organisation_kind: string | null;
  full_name: string;
};

export type ItemRow = {
  id: string;
  project_id: string;
  number: string;
  type: string;
  title: string;
  status: string;
  severity: string;
  owner_id: string | null;
  owner_org_id: string | null;
  created_by: string;
  creator_org_id: string | null;
  visibility: string;
  due_at: string | null;
  created_at: string;
  closed_at: string | null;
};

export async function projectMembers(admin: SupabaseClient, projectId: string): Promise<DirMember[]> {
  const { data, error } = await admin
    .from('member_directory')
    .select('user_id, role, organisation_id, organisation_kind, full_name')
    .eq('project_id', projectId)
    .eq('active', true);
  if (error) throw error;
  return (data ?? []) as DirMember[];
}

/** Zelfde regel als can_see_item() in de database. */
export function canSeeItem(m: DirMember, i: ItemRow): boolean {
  if (m.organisation_kind === 'eigen') return true;
  if (i.visibility !== 'project') return false;
  return (
    i.created_by === m.user_id ||
    i.owner_id === m.user_id ||
    (!!m.organisation_id && (m.organisation_id === i.creator_org_id || m.organisation_id === i.owner_org_id))
  );
}

export function withRoles(members: DirMember[], roles: string[], item?: ItemRow): string[] {
  return members.filter((m) => roles.includes(m.role) && (!item || canSeeItem(m, item))).map((m) => m.user_id);
}
