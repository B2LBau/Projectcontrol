// Voorstel voor een melding op basis van ingesproken of getypte tekst.
// Dit is de lokale (offline) variant; online gebruikt de app de AI-functie
// `suggest` op de server en valt bij een fout terug op deze regels.

import { deadlineFromDate } from './deadlines';
import { ItemType, Severity } from './types';
import { addDays, addWorkdays, amsterdamParts, CivilDate, toCivil, weekday } from './workdays';

export type SuggestMember = { user_id: string; full_name: string; role: string; organisation_name: string | null };

export type Suggestion = {
  type: ItemType;
  title: string;
  description: string;
  severity: Severity;
  owner_id: string | null;
  due_at: string | null; // ISO
  location_label: string | null;
  source: 'ai' | 'lokaal';
};

const TYPE_WORDS: [ItemType, RegExp][] = [
  ['afwijking', /\b(afwijking|afwijkend|non-?conformiteit|klopt niet|niet volgens (tekening|ontwerp|eis)|te ondiep|te diep|beschadigd|schade)\b/i],
  ['besluit', /\b(besluit|besloten|afgesproken dat|we hebben besloten|akkoord gegeven)\b/i],
  ['gereedmelding', /\b(gereed|klaar|afgerond|opgeleverd|gereedmelding)\b/i],
  ['verkeersmaatregel', /\b(verkeersmaatregel|afzetting|bebording|omleiding|bord(en)?|hekken|rijstrook|verkeer)\b/i],
  ['vraag', /^(vraag|kan iemand|weet iemand|wie weet)\b|\?\s*$/i],
  ['actie', /\b(actie|moet|moeten|graag|regelen|zorgen dat|nog doen|uitzoeken|aanvragen|bestellen)\b/i],
  ['constatering', /\b(constatering|geconstateerd|gezien|opgevallen|zag)\b/i],
];

const SEVERITY_WORDS: [Severity, RegExp][] = [
  ['kritiek', /\b(levensgevaarlijk|direct stilleggen|stilleggen|gevaarlijke situatie|acuut gevaar|gaslek|kabel geraakt)\b/i],
  ['hoog', /\b(urgent|spoed|met spoed|direct|meteen|gevaarlijk|onveilig|hoge prioriteit)\b/i],
  ['laag', /\b(geen haast|laag|als er tijd is|wanneer het uitkomt)\b/i],
];

const DAYS: Record<string, number> = {
  zondag: 0,
  maandag: 1,
  dinsdag: 2,
  woensdag: 3,
  donderdag: 4,
  vrijdag: 5,
  zaterdag: 6,
};
const MONTHS: Record<string, number> = {
  januari: 1,
  februari: 2,
  maart: 3,
  april: 4,
  mei: 5,
  juni: 6,
  juli: 7,
  augustus: 8,
  september: 9,
  oktober: 10,
  november: 11,
  december: 12,
};
const NUMBER_WORDS: Record<string, number> = {
  een: 1,
  één: 1,
  twee: 2,
  drie: 3,
  vier: 4,
  vijf: 5,
  zes: 6,
  zeven: 7,
  acht: 8,
  negen: 9,
  tien: 10,
};

function num(s: string): number | null {
  if (/^\d+$/.test(s)) return Number(s);
  return NUMBER_WORDS[s.toLowerCase()] ?? null;
}

/** Herkent relatieve en absolute datums in Nederlandse spreektaal. */
export function parseDueDate(text: string, now: Date): CivilDate | null {
  const t = text.toLowerCase();
  const today = amsterdamParts(now).date;

  if (/\bovermorgen\b/.test(t)) return addDays(today, 2);
  if (/\bmorgen\b/.test(t)) return addDays(today, 1);
  if (/\b(vandaag|vanmiddag|vanavond|z\.?s\.?m\.?|zo snel mogelijk)\b/.test(t)) return today;
  if (/\b(eind(e)? van de|voor het) week\b|\beind deze week\b/.test(t)) {
    const wd = weekday(today);
    return addDays(today, wd <= 5 ? 5 - wd : 6);
  }
  if (/\bvolgende week\b/.test(t)) {
    const wd = weekday(today);
    return addDays(today, (wd === 0 ? 1 : 8 - wd) + 4); // vrijdag volgende week
  }

  let m = t.match(/\bover (\d+|een|één|twee|drie|vier|vijf|zes|zeven|acht|negen|tien) (werkdag(en)?|dag(en)?|week|weken)\b/);
  if (m) {
    const n = num(m[1]) ?? 1;
    if (m[2].startsWith('werkdag')) return addWorkdays(today, n);
    if (m[2].startsWith('dag')) return addDays(today, n);
    return addDays(today, n * 7);
  }

  m = t.match(/\b(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?\b/);
  if (m) {
    const d = Number(m[1]);
    const mo = Number(m[2]);
    let y = m[3] ? Number(m[3]) : Number(today.slice(0, 4));
    if (y < 100) y += 2000;
    if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
      let c = toCivil(y, mo, d);
      if (!m[3] && c < today) c = toCivil(y + 1, mo, d);
      return c;
    }
  }

  m = t.match(/\b(\d{1,2}) (januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\b/);
  if (m) {
    const y = Number(today.slice(0, 4));
    let c = toCivil(y, MONTHS[m[2]], Number(m[1]));
    if (c < today) c = toCivil(y + 1, MONTHS[m[2]], Number(m[1]));
    return c;
  }

  m = t.match(/\b(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag)\b/);
  if (m) {
    const target = DAYS[m[1]];
    const wd = weekday(today);
    let diff = (target - wd + 7) % 7;
    if (diff === 0) diff = 7;
    // "vóór donderdag" = uiterlijk woensdag
    const before = new RegExp(`\\b(voor|vóór) ${m[1]}\\b`).test(t);
    return addDays(today, before ? Math.max(diff - 1, 0) : diff);
  }
  return null;
}

/** Zoekt een projectlid waarvan (een deel van) de naam of de rol genoemd wordt. */
export function findOwner(text: string, members: SuggestMember[]): string | null {
  const t = ` ${text.toLowerCase()} `;
  for (const m of members) {
    const parts = m.full_name.toLowerCase().split(/\s+/).filter((p) => p.length >= 3);
    const last = parts[parts.length - 1];
    if (last && t.includes(` ${last}`)) return m.user_id;
    if (parts[0] && t.includes(` ${parts[0]} `)) return m.user_id;
  }
  for (const m of members) {
    const org = m.organisation_name?.toLowerCase();
    const roleWord = m.role.replace('oa_', '');
    if (org && t.includes(org) && t.includes(roleWord)) return m.user_id;
  }
  return null;
}

export function findLocation(text: string): string | null {
  const m = text.match(
    /\b((?:mofput|put|tracédeel|tracedeel|km|kilometer|station|kast|paal|vak|bouwdeel|verdieping|sleuf|kruising)\s*[\w.-]+)/i,
  ) ?? text.match(/\b(?:bij|aan|op|in de|in het) ([A-Z][a-zà-ü]+(?:straat|weg|laan|plein|dijk|kade|singel|pad|steeg)\s*\d*\w?)/);
  return m ? m[1].trim() : null;
}

export function makeTitle(text: string): string {
  const clean = text
    .replace(/^\s*(actie|afwijking|besluit|constatering|gereedmelding|vraag|verkeersmaatregel)\s*[:,.-]?\s*/i, '')
    .trim();
  const first = clean.split(/(?<=[.!?])\s+/)[0] ?? clean;
  const t = first.length > 80 ? first.slice(0, 77).trimEnd() + '…' : first;
  return t.charAt(0).toUpperCase() + t.slice(1);
}

export function suggestLocally(text: string, members: SuggestMember[], now: Date, hint?: ItemType): Suggestion {
  const type = hint ?? TYPE_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'constatering';
  const severity = SEVERITY_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'normaal';
  const due = parseDueDate(text, now);
  return {
    type,
    title: makeTitle(text) || 'Melding',
    description: text.trim(),
    severity,
    owner_id: findOwner(text, members),
    due_at: due ? deadlineFromDate(due).toISOString() : null,
    location_label: findLocation(text),
    source: 'lokaal',
  };
}
