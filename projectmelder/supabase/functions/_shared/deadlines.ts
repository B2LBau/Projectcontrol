// GEGENEREERD uit src/domain/deadlines.ts door scripts/sync-shared.js – niet handmatig wijzigen.
// Termijnen, herinneringen en escalatie (FO §5.13).

import type { ItemType, Severity } from './types.ts';
import {
  addWorkdays,
  amsterdamParts,
  amsterdamTime,
  type CivilDate,
  isWorkday,
  nextWorkday,
  workdaysBetween,
} from './workdays.ts';

/** Termijn zonder tijd valt aan het eind van de werkdag. */
export const END_OF_DAY_HOUR = 17;
/** Herinneringen worden 's ochtends verstuurd. */
export const REMINDER_HOUR = 7;
/** Werkdagen na termijn waarna geëscaleerd wordt. */
export const ESCALATE_AFTER_WORKDAYS = 2;

const AFWIJKING_WORKDAYS: Record<Exclude<Severity, 'kritiek'>, number> = { hoog: 2, normaal: 5, laag: 10 };

/** Standaardtermijn per type/ernst; null = geen termijn. */
export function defaultDeadline(type: ItemType, severity: Severity, now: Date): Date | null {
  const today = amsterdamParts(now).date;
  const eod = (c: CivilDate) => amsterdamTime(c, END_OF_DAY_HOUR);
  switch (type) {
    case 'actie':
      return eod(addWorkdays(today, 5));
    case 'vraag':
    case 'gereedmelding':
      return eod(addWorkdays(today, 2));
    case 'afwijking':
      if (severity === 'kritiek') return new Date(now.getTime() + 24 * 3600 * 1000);
      return eod(addWorkdays(today, AFWIJKING_WORKDAYS[severity]));
    case 'constatering':
      return severity === 'hoog' || severity === 'kritiek' ? eod(addWorkdays(today, 2)) : null;
    case 'verkeersmaatregel':
      return eod(nextWorkday(today));
    default:
      return null;
  }
}

export function deadlineFromDate(c: CivilDate): Date {
  return amsterdamTime(c, END_OF_DAY_HOUR);
}

export type Bucket = 'te_laat' | 'vandaag' | 'deze_week' | 'later' | 'geen';

export const BUCKET_LABELS: Record<Bucket, string> = {
  te_laat: 'Te laat',
  vandaag: 'Vandaag',
  deze_week: 'Deze week',
  later: 'Later',
  geen: 'Zonder termijn',
};

export function bucketFor(due: Date | null, now: Date): Bucket {
  if (!due) return 'geen';
  if (due.getTime() < now.getTime()) return 'te_laat';
  const d = amsterdamParts(due).date;
  const t = amsterdamParts(now).date;
  if (d === t) return 'vandaag';
  const diff = (Date.parse(d) - Date.parse(t)) / 86400000;
  return diff <= 7 ? 'deze_week' : 'later';
}

/** Kleur volgens FO §6: rood te laat, oranje binnen 2 werkdagen, blauw open, groen gesloten. */
export function deadlineColor(due: Date | null, now: Date, closed: boolean): string {
  if (closed) return '#15803D';
  if (!due) return '#1F6FEB';
  if (due.getTime() < now.getTime()) return '#C62828';
  const wd = workdaysBetween(amsterdamParts(now).date, amsterdamParts(due).date);
  return wd <= 2 ? '#D97706' : '#1F6FEB';
}

export type ReminderKind = 'voor' | 'op_dag' | 'na' | 'escalatie';

export type Reminder = { kind: ReminderKind; at: Date };

/**
 * Herinneringsschema (FO FE: 2 werkdagen vóór, op de dag 07:00, 1 werkdag na, escalatie na 2 werkdagen).
 * Momenten in het verleden ten opzichte van `created` vallen weg.
 */
export function reminderSchedule(due: Date, created: Date): Reminder[] {
  const dueDay = amsterdamParts(due).date;
  const out: Reminder[] = [
    { kind: 'voor', at: amsterdamTime(addWorkdays(dueDay, -2), REMINDER_HOUR) },
    { kind: 'op_dag', at: amsterdamTime(dueDay, REMINDER_HOUR) },
    { kind: 'na', at: amsterdamTime(addWorkdays(dueDay, 1), REMINDER_HOUR) },
    { kind: 'escalatie', at: amsterdamTime(addWorkdays(dueDay, ESCALATE_AFTER_WORKDAYS), REMINDER_HOUR) },
  ];
  return out.filter((r) => r.at.getTime() > created.getTime());
}

/** Reminders die nu verstuurd moeten worden (tussen `since` en `now`). */
export function dueReminders(due: Date, created: Date, since: Date, now: Date): Reminder[] {
  return reminderSchedule(due, created).filter(
    (r) => r.at.getTime() > since.getTime() && r.at.getTime() <= now.getTime(),
  );
}

/** Stille uren: geen herinneringen buiten werktijd/weekend, behalve kritiek. */
export function isQuietTime(now: Date, severity: Severity): boolean {
  if (severity === 'kritiek') return false;
  const p = amsterdamParts(now);
  if (!isWorkday(p.date)) return true;
  return p.hour < REMINDER_HOUR || p.hour >= 19;
}
