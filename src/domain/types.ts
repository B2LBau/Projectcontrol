export type Category = 'grondwerk' | 'elektro';

export type CheckStatus = 'voldoet' | 'voldoet_niet' | 'onvolledig';

export type InputDef =
  | { kind: 'number'; key: string; label: string; unit: string; hint?: string }
  | { kind: 'boolean'; key: string; label: string }
  | { kind: 'select'; key: string; label: string; options: { value: string; label: string }[] }
  | { kind: 'text'; key: string; label: string; hint?: string };

export type ParamDef = {
  key: string;
  label: string;
  unit: string;
  default: number;
};

export type InputValue = number | boolean | string | undefined;
export type InputValues = Record<string, InputValue>;
export type ParamValues = Record<string, number>;

export type Evaluation = {
  status: CheckStatus;
  /** Regels die uitleggen waarom de eis wel/niet gehaald is. */
  details: string[];
};

export type RequirementDef = {
  id: string;
  title: string;
  category: Category;
  description: string;
  /** Verwijzing naar de bron van de eis; de projectspecificatie gaat altijd voor. */
  reference: string;
  inputs: InputDef[];
  params: ParamDef[];
  minPhotos: number;
  /** Moet aangetoond zijn voordat de sleuf aangevuld mag worden. */
  beforeBackfill: boolean;
  evaluate: (values: InputValues, params: ParamValues) => Evaluation;
};

export type GeoPoint = { latitude: number; longitude: number; accuracy: number | null };

export type Project = {
  id: string;
  name: string;
  number: string;
  client: string;
  location: string;
  createdAt: string;
  /** Afwijkende normwaarden per eis: paramOverrides[eisId][paramKey]. */
  paramOverrides: Record<string, ParamValues>;
};

export type Section = {
  id: string;
  projectId: string;
  name: string;
  from: string;
  to: string;
  /** Eisen die voor dit tracédeel aangetoond moeten worden. */
  requiredChecks: string[];
  createdAt: string;
  release?: { by: string; at: string };
};

export type Registration = {
  id: string;
  sectionId: string;
  checkId: string;
  values: InputValues;
  /** De gebruikte normwaarden op het moment van registreren. */
  params: ParamValues;
  evaluation: Evaluation;
  photos: string[];
  location: GeoPoint | null;
  recordedBy: string;
  recordedAt: string;
  remark: string;
};

export type Settings = {
  userName: string;
  company: string;
};

export type AppData = {
  version: 1;
  settings: Settings;
  projects: Project[];
  sections: Section[];
  registrations: Registration[];
};
