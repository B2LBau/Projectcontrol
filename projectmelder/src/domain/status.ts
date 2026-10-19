// Statusmodellen per meldingstype (FO hoofdstuk 6).
// Dezelfde tabel staat in supabase/migrations (item_transitions); houd die gelijk.

import { ItemType, Role } from './types';

export type StatusDef = { key: string; label: string; closed?: boolean };

export const STATUSES: Record<ItemType, StatusDef[]> = {
  actie: [
    { key: 'nieuw', label: 'Nieuw' },
    { key: 'opgepakt', label: 'Opgepakt' },
    { key: 'gereed_gemeld', label: 'Gereed gemeld' },
    { key: 'afgerond', label: 'Afgerond', closed: true },
  ],
  besluit: [
    { key: 'concept', label: 'Concept' },
    { key: 'vastgesteld', label: 'Vastgesteld', closed: true },
    { key: 'herzien', label: 'Herzien', closed: true },
    { key: 'vervallen', label: 'Vervallen', closed: true },
  ],
  constatering: [
    { key: 'gemeld', label: 'Gemeld' },
    { key: 'in_behandeling', label: 'In behandeling' },
    { key: 'afgehandeld', label: 'Afgehandeld', closed: true },
  ],
  controleronde: [
    { key: 'gepland', label: 'Gepland' },
    { key: 'bezig', label: 'Bezig' },
    { key: 'afgerond', label: 'Afgerond', closed: true },
    { key: 'overgeslagen', label: 'Overgeslagen', closed: true },
  ],
  verkeersmaatregel: [
    { key: 'aangevraagd', label: 'Aangevraagd' },
    { key: 'geplaatst', label: 'Geplaatst' },
    { key: 'actief', label: 'Actief' },
    { key: 'verwijderd', label: 'Verwijderd' },
    { key: 'gesloten', label: 'Gesloten', closed: true },
  ],
  gereedmelding: [
    { key: 'ingediend', label: 'Ingediend' },
    { key: 'in_beoordeling', label: 'In beoordeling' },
    { key: 'aanvulling_gevraagd', label: 'Aanvulling gevraagd' },
    { key: 'geaccepteerd', label: 'Geaccepteerd', closed: true },
    { key: 'afgekeurd', label: 'Afgekeurd', closed: true },
  ],
  afwijking: [
    { key: 'gemeld', label: 'Gemeld' },
    { key: 'beoordeeld', label: 'Beoordeeld' },
    { key: 'maatregel', label: 'Maatregel in uitvoering' },
    { key: 'hersteld', label: 'Hersteld' },
    { key: 'geverifieerd', label: 'Geverifieerd' },
    { key: 'gesloten', label: 'Gesloten', closed: true },
  ],
  vraag: [
    { key: 'open', label: 'Open' },
    { key: 'beantwoord', label: 'Beantwoord' },
    { key: 'gesloten', label: 'Gesloten', closed: true },
  ],
};

export const WITHDRAWN = 'ingetrokken';

// Wie mag naar welke status. 'iedereen' = elk projectlid dat de melding mag zien;
// 'eigenaar' = de eigenaar; 'beoordelaar' = interne rollen met beoordelingsrecht.
export type Actor = 'iedereen' | 'eigenaar' | 'melder' | 'beoordelaar';

export type Transition = { from: string; to: string; by: Actor[]; label: string };

const T = (from: string, to: string, label: string, ...by: Actor[]): Transition => ({ from, to, label, by });

export const TRANSITIONS: Record<ItemType, Transition[]> = {
  actie: [
    T('nieuw', 'opgepakt', 'Oppakken', 'eigenaar', 'beoordelaar'),
    T('nieuw', 'gereed_gemeld', 'Gereed melden', 'eigenaar'),
    T('opgepakt', 'gereed_gemeld', 'Gereed melden', 'eigenaar'),
    T('gereed_gemeld', 'afgerond', 'Accepteren', 'melder', 'beoordelaar'),
    T('gereed_gemeld', 'opgepakt', 'Terugzetten', 'melder', 'beoordelaar'),
    T('afgerond', 'opgepakt', 'Heropenen', 'melder', 'beoordelaar'),
  ],
  besluit: [
    T('concept', 'vastgesteld', 'Vaststellen', 'beoordelaar'),
    T('vastgesteld', 'herzien', 'Herzien', 'beoordelaar'),
    T('vastgesteld', 'vervallen', 'Laten vervallen', 'beoordelaar'),
  ],
  constatering: [
    T('gemeld', 'in_behandeling', 'In behandeling nemen', 'eigenaar', 'beoordelaar'),
    T('gemeld', 'afgehandeld', 'Afhandelen', 'beoordelaar'),
    T('in_behandeling', 'afgehandeld', 'Afhandelen', 'beoordelaar'),
  ],
  controleronde: [
    T('gepland', 'bezig', 'Starten', 'iedereen'),
    T('bezig', 'afgerond', 'Afronden', 'eigenaar', 'melder', 'beoordelaar'),
    T('gepland', 'overgeslagen', 'Overslaan', 'beoordelaar'),
  ],
  verkeersmaatregel: [
    T('aangevraagd', 'geplaatst', 'Geplaatst', 'eigenaar', 'beoordelaar'),
    T('geplaatst', 'actief', 'Actief (controles)', 'eigenaar', 'beoordelaar'),
    T('actief', 'verwijderd', 'Verwijderd', 'eigenaar', 'beoordelaar'),
    T('verwijderd', 'gesloten', 'Sluiten', 'beoordelaar'),
  ],
  gereedmelding: [
    T('ingediend', 'in_beoordeling', 'In beoordeling nemen', 'beoordelaar'),
    T('ingediend', 'geaccepteerd', 'Accepteren', 'beoordelaar'),
    T('in_beoordeling', 'geaccepteerd', 'Accepteren', 'beoordelaar'),
    T('in_beoordeling', 'afgekeurd', 'Afkeuren', 'beoordelaar'),
    T('in_beoordeling', 'aanvulling_gevraagd', 'Aanvulling vragen', 'beoordelaar'),
    T('aanvulling_gevraagd', 'ingediend', 'Opnieuw indienen', 'melder', 'eigenaar'),
  ],
  afwijking: [
    T('gemeld', 'beoordeeld', 'Beoordelen', 'beoordelaar'),
    T('beoordeeld', 'maatregel', 'Maatregel starten', 'eigenaar', 'beoordelaar'),
    T('maatregel', 'hersteld', 'Hersteld melden', 'eigenaar'),
    T('hersteld', 'geverifieerd', 'Verifiëren', 'beoordelaar'),
    T('hersteld', 'maatregel', 'Herstel afkeuren', 'beoordelaar'),
    T('geverifieerd', 'gesloten', 'Sluiten', 'beoordelaar'),
  ],
  vraag: [
    T('open', 'beantwoord', 'Beantwoorden', 'eigenaar', 'iedereen'),
    T('beantwoord', 'gesloten', 'Sluiten', 'melder', 'beoordelaar'),
    T('beantwoord', 'open', 'Heropenen', 'melder'),
  ],
};

// Interne rollen met beoordelings-/afsluitrecht (rechtenmatrix FO §2.3).
export const REVIEWER_ROLES: Role[] = ['projectleider', 'werkvoorbereider', 'uitvoerder', 'werkverantwoordelijke'];

export function initialStatus(type: ItemType): string {
  return STATUSES[type][0].key;
}

export function statusLabel(type: ItemType, status: string): string {
  if (status === WITHDRAWN) return 'Ingetrokken';
  return STATUSES[type].find((s) => s.key === status)?.label ?? status;
}

export function isClosed(type: ItemType, status: string): boolean {
  if (status === WITHDRAWN) return true;
  return STATUSES[type].find((s) => s.key === status)?.closed === true;
}

export type ActorContext = { userId: string; role: Role; ownerId: string | null; createdBy: string };

export function actorsFor(ctx: ActorContext): Set<Actor> {
  const a = new Set<Actor>(['iedereen']);
  if (ctx.ownerId === ctx.userId) a.add('eigenaar');
  if (ctx.createdBy === ctx.userId) a.add('melder');
  if (REVIEWER_ROLES.includes(ctx.role)) a.add('beoordelaar');
  return a;
}

export function allowedTransitions(type: ItemType, status: string, ctx: ActorContext): Transition[] {
  const mine = actorsFor(ctx);
  return TRANSITIONS[type].filter((t) => {
    if (t.from !== status || !t.by.some((b) => mine.has(b))) return false;
    // Verificatie van herstel door een ander dan de hersteller (FO FE afwijkingen).
    if (type === 'afwijking' && t.to === 'geverifieerd' && ctx.ownerId === ctx.userId) return false;
    return true;
  });
}
