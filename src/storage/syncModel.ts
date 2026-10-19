import type { AppData, Project, Registration, Section } from '../domain/types';

/**
 * Pure logica voor de synchronisatie met Supabase: welke records nog verstuurd moeten worden, hoe een
 * record naar een databaserij vertaald wordt en hoe opgehaalde rijen met de lokale gegevens samengaan.
 */

export type Table = 'projects' | 'sections' | 'registrations';

export const TABLES: Table[] = ['projects', 'sections', 'registrations'];

export type SyncMeta = {
  /** Records met lokale wijzigingen die nog naar de server moeten, met het volgnummer van de laatste wijziging. */
  pending: Record<string, number>;
  seq: number;
  /** Hoogste updated_at van de server die al is opgehaald. */
  cursor: string | null;
};

export const EMPTY_SYNC: SyncMeta = { pending: {}, seq: 0, cursor: null };

export function syncKey(table: Table, id: string): string {
  return `${table}:${id}`;
}

export function splitKey(key: string): [Table, string] {
  const i = key.indexOf(':');
  return [key.slice(0, i) as Table, key.slice(i + 1)];
}

export function markPending(meta: SyncMeta, keys: string[]): SyncMeta {
  if (keys.length === 0) return meta;
  const seq = meta.seq + 1;
  const pending = { ...meta.pending };
  for (const k of keys) pending[k] = seq;
  return { ...meta, seq, pending };
}

/** Haalt verstuurde records uit de wachtrij, tenzij ze tijdens het versturen opnieuw gewijzigd zijn. */
export function clearPending(meta: SyncMeta, sent: Record<string, number>): SyncMeta {
  const pending = { ...meta.pending };
  for (const [k, seq] of Object.entries(sent)) if (pending[k] === seq) delete pending[k];
  return { ...meta, pending };
}

export function allKeys(data: AppData): string[] {
  return [
    ...data.projects.map((p) => syncKey('projects', p.id)),
    ...data.sections.map((s) => syncKey('sections', s.id)),
    ...data.registrations.map((r) => syncKey('registrations', r.id)),
  ];
}

export function photoName(uri: string): string {
  return uri.slice(uri.lastIndexOf('/') + 1);
}

/** Pad van een foto in de opslagbucket. */
export function photoPath(registrationId: string, uri: string): string {
  return `${registrationId}/${photoName(uri)}`;
}

// Databaserijen ------------------------------------------------------------------------------------

export type ProjectRow = {
  id: string;
  name: string;
  number: string;
  client: string;
  location: string;
  grid_operator: string;
  param_overrides: Project['paramOverrides'];
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
};

export type SectionRow = {
  id: string;
  project_id: string;
  name: string;
  from_point: string;
  to_point: string;
  required_checks: string[];
  created_at: string;
  release: Section['release'] | null;
  release_log: NonNullable<Section['releaseLog']>;
  updated_at?: string;
  deleted_at?: string | null;
};

export type RegistrationRow = {
  id: string;
  section_id: string;
  check_id: string;
  input_values: Registration['values'];
  params: Registration['params'];
  evaluation: Registration['evaluation'];
  photos: string[];
  location: Registration['location'];
  recorded_by: string;
  recorded_at: string;
  remark: string;
  withdrawn: Registration['withdrawn'] | null;
  updated_at?: string;
};

export function toProjectRow(p: Project): ProjectRow {
  return {
    id: p.id,
    name: p.name,
    number: p.number,
    client: p.client,
    location: p.location,
    grid_operator: p.gridOperator,
    param_overrides: p.paramOverrides,
    created_at: p.createdAt,
  };
}

export function fromProjectRow(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    number: r.number,
    client: r.client,
    location: r.location,
    gridOperator: r.grid_operator,
    paramOverrides: r.param_overrides ?? {},
    createdAt: r.created_at,
  };
}

export function toSectionRow(s: Section): SectionRow {
  return {
    id: s.id,
    project_id: s.projectId,
    name: s.name,
    from_point: s.from,
    to_point: s.to,
    required_checks: s.requiredChecks,
    created_at: s.createdAt,
    release: s.release ?? null,
    release_log: s.releaseLog ?? [],
  };
}

export function fromSectionRow(r: SectionRow): Section {
  const section: Section = {
    id: r.id,
    projectId: r.project_id,
    name: r.name,
    from: r.from_point,
    to: r.to_point,
    requiredChecks: r.required_checks ?? [],
    createdAt: r.created_at,
    releaseLog: r.release_log ?? [],
  };
  if (r.release) section.release = r.release;
  return section;
}

export function toRegistrationRow(r: Registration): RegistrationRow {
  return {
    id: r.id,
    section_id: r.sectionId,
    check_id: r.checkId,
    input_values: r.values,
    params: r.params,
    evaluation: r.evaluation,
    photos: r.photos.map((uri) => photoPath(r.id, uri)),
    location: r.location,
    recorded_by: r.recordedBy,
    recorded_at: r.recordedAt,
    remark: r.remark,
    withdrawn: r.withdrawn ?? null,
  };
}

/** `localUri` geeft voor een bestandsnaam de plek waar de foto op dit toestel staat (of komt te staan). */
export function fromRegistrationRow(r: RegistrationRow, localUri: (name: string) => string): Registration {
  const registration: Registration = {
    id: r.id,
    sectionId: r.section_id,
    checkId: r.check_id,
    values: r.input_values ?? {},
    params: r.params ?? {},
    evaluation: r.evaluation,
    photos: (r.photos ?? []).map((path) => localUri(photoName(path))),
    location: r.location,
    recordedBy: r.recorded_by,
    recordedAt: r.recorded_at,
    remark: r.remark,
  };
  if (r.withdrawn) registration.withdrawn = r.withdrawn;
  return registration;
}

// Samenvoegen ---------------------------------------------------------------------------------------

export type Pulled = { projects: ProjectRow[]; sections: SectionRow[]; registrations: RegistrationRow[] };

function mergeList<T extends { id: string }>(
  local: T[],
  rows: { id: string; deleted_at?: string | null }[],
  convert: (row: never) => T,
  isPending: (id: string) => boolean,
  prepend: boolean,
): T[] {
  if (rows.length === 0) return local;
  const byId = new Map(local.map((x) => [x.id, x]));
  const added: T[] = [];
  for (const row of rows) {
    if (isPending(row.id)) continue; // lokale wijziging gaat voor tot die verstuurd is
    if (row.deleted_at) {
      byId.delete(row.id);
      continue;
    }
    const record = convert(row as never);
    if (!byId.has(row.id)) added.push(record);
    byId.set(row.id, record);
  }
  const kept = local.filter((x) => byId.has(x.id)).map((x) => byId.get(x.id)!);
  return prepend ? [...added, ...kept] : [...kept, ...added];
}

export function mergePulled(data: AppData, meta: SyncMeta, pulled: Pulled, localUri: (name: string) => string): AppData {
  const pending = (table: Table) => (id: string) => syncKey(table, id) in meta.pending;
  return {
    ...data,
    projects: mergeList(data.projects, pulled.projects, fromProjectRow, pending('projects'), true),
    sections: mergeList(data.sections, pulled.sections, fromSectionRow, pending('sections'), false),
    registrations: mergeList(
      data.registrations,
      pulled.registrations,
      (row: RegistrationRow) => fromRegistrationRow(row, localUri),
      pending('registrations'),
      false,
    ),
  };
}
