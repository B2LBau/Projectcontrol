// GEGENEREERD uit src/domain/types.ts door scripts/sync-shared.js – niet handmatig wijzigen.
// Kernbegrippen uit het functioneel ontwerp (hoofdstuk 2, 4 en 6).

export type Role =
  | 'projectleider'
  | 'werkvoorbereider'
  | 'uitvoerder'
  | 'logistiek'
  | 'monteur'
  | 'werkverantwoordelijke'
  | 'oa_werkvoorbereider'
  | 'oa_uitvoerder'
  | 'oa_voorman';

export const ROLE_LABELS: Record<Role, string> = {
  projectleider: 'Projectleider',
  werkvoorbereider: 'Werkvoorbereider',
  uitvoerder: 'Uitvoerder',
  logistiek: 'Logistiek medewerker',
  monteur: 'Monteur',
  werkverantwoordelijke: 'Werkverantwoordelijke',
  oa_werkvoorbereider: 'Werkvoorbereider OA',
  oa_uitvoerder: 'Uitvoerder OA',
  oa_voorman: 'Voorman OA',
};

export const INTERNAL_ROLES: Role[] = [
  'projectleider',
  'werkvoorbereider',
  'uitvoerder',
  'logistiek',
  'monteur',
  'werkverantwoordelijke',
];
export const OA_ROLES: Role[] = ['oa_werkvoorbereider', 'oa_uitvoerder', 'oa_voorman'];

export type OrganisationKind = 'eigen' | 'onderaannemer' | 'opdrachtgever';

export type ItemType =
  | 'actie'
  | 'besluit'
  | 'constatering'
  | 'controleronde'
  | 'verkeersmaatregel'
  | 'gereedmelding'
  | 'afwijking'
  | 'vraag';

export const ITEM_TYPES: ItemType[] = [
  'actie',
  'besluit',
  'constatering',
  'afwijking',
  'gereedmelding',
  'verkeersmaatregel',
  'controleronde',
  'vraag',
];

export const ITEM_TYPE_INFO: Record<ItemType, { label: string; prefix: string; color: string; icon: string }> = {
  actie: { label: 'Actie', prefix: 'A', color: '#1F6FEB', icon: '✔' },
  besluit: { label: 'Besluit', prefix: 'B', color: '#6F42C1', icon: '⚖' },
  constatering: { label: 'Constatering', prefix: 'C', color: '#0E8A7E', icon: '👁' },
  controleronde: { label: 'Controleronde', prefix: 'R', color: '#5A6B7B', icon: '☑' },
  verkeersmaatregel: { label: 'Verkeersmaatregel', prefix: 'V', color: '#D97706', icon: '⚠' },
  gereedmelding: { label: 'Gereedmelding', prefix: 'G', color: '#15803D', icon: '🏁' },
  afwijking: { label: 'Afwijking', prefix: 'X', color: '#C62828', icon: '✖' },
  vraag: { label: 'Vraag / info', prefix: 'Q', color: '#0369A1', icon: '?' },
};

export type Severity = 'laag' | 'normaal' | 'hoog' | 'kritiek';
export const SEVERITIES: Severity[] = ['laag', 'normaal', 'hoog', 'kritiek'];
export const SEVERITY_LABELS: Record<Severity, string> = {
  laag: 'Laag',
  normaal: 'Normaal',
  hoog: 'Hoog',
  kritiek: 'Kritiek',
};

export type Visibility = 'project' | 'intern';

export type Coordinates = { lat: number; lng: number; accuracy: number | null };

export type Profile = {
  id: string;
  phone: string;
  full_name: string;
  job_title: string | null;
  organisation_id: string | null;
  is_admin: boolean;
};

export type Organisation = { id: string; name: string; kind: OrganisationKind };

export type Project = {
  id: string;
  code: string;
  name: string;
  client: string | null;
  location: string | null;
  created_at: string;
};

export type Member = {
  project_id: string;
  user_id: string;
  role: Role;
  organisation_id: string | null;
  full_name: string;
  phone: string;
  organisation_name: string | null;
  organisation_kind: OrganisationKind | null;
};

export type ChannelKind = 'algemeen' | 'intern' | 'oa' | 'werkpakket' | 'direct';
export type Channel = {
  id: string;
  project_id: string;
  name: string;
  kind: ChannelKind;
  organisation_id: string | null;
};

export type MessageKind = 'tekst' | 'foto' | 'spraak' | 'video' | 'document' | 'melding' | 'systeem';

export type Message = {
  id: string;
  channel_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  transcript: string | null;
  item_id: string | null;
  retracted_at: string | null;
  created_at: string;
  captured_at: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
};

export type AttachmentKind = 'foto' | 'video' | 'spraak' | 'document';
export type AttachmentSource = 'camera' | 'galerij' | 'microfoon';

export type Attachment = {
  id: string;
  project_id: string;
  item_id: string | null;
  message_id: string | null;
  kind: AttachmentKind;
  storage_path: string;
  mime: string;
  created_by: string;
  captured_at: string | null;
  capture_end_at: string | null;
  uploaded_at: string;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  heading: number | null;
  end_lat: number | null;
  end_lng: number | null;
  source: AttachmentSource;
  duration_ms: number | null;
};

export type Item = {
  id: string;
  project_id: string;
  number: string;
  type: ItemType;
  title: string;
  description: string | null;
  transcript: string | null;
  status: string;
  severity: Severity;
  owner_id: string | null;
  owner_org_id: string | null;
  due_at: string | null;
  original_due_at: string | null;
  location_label: string | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  captured_at: string | null;
  created_by: string;
  creator_org_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  visibility: Visibility;
  labels: string[];
  meeting_id: string | null;
  source_message_id: string | null;
  parent_item_id: string | null;
  details: Record<string, unknown>;
  withdrawn_reason: string | null;
};

export type ItemEventKind =
  | 'aangemaakt'
  | 'status'
  | 'termijn'
  | 'eigenaar'
  | 'veld'
  | 'opmerking'
  | 'ingetrokken';

export type ItemEvent = {
  id: number;
  item_id: string;
  actor_id: string | null;
  at: string;
  kind: ItemEventKind;
  from_value: string | null;
  to_value: string | null;
  note: string | null;
};

export type Meeting = {
  id: string;
  project_id: string;
  title: string;
  kind: string;
  starts_at: string;
  location: string | null;
  attendees: { user_id: string; present: boolean }[];
  closed_at: string | null;
};
