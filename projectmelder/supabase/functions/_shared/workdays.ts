// GEGENEREERD uit src/domain/workdays.ts door scripts/sync-shared.js – niet handmatig wijzigen.
// Werkdagen en kalenderdatums. Datums worden als 'YYYY-MM-DD' (kalenderdatum in
// Nederland) doorgegeven, zodat app en server hetzelfde rekenen ongeacht tijdzone.

export type CivilDate = string; // 'YYYY-MM-DD'

const pad = (n: number) => String(n).padStart(2, '0');

export function toCivil(y: number, m: number, d: number): CivilDate {
  const dt = new Date(Date.UTC(y, m - 1, d));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function parseCivil(c: CivilDate): { y: number; m: number; d: number } {
  const [y, m, d] = c.split('-').map(Number);
  return { y, m, d };
}

export function addDays(c: CivilDate, days: number): CivilDate {
  const { y, m, d } = parseCivil(c);
  return toCivil(y, m, d + days);
}

/** 0 = zondag ... 6 = zaterdag */
export function weekday(c: CivilDate): number {
  const { y, m, d } = parseCivil(c);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function easterSunday(y: number): CivilDate {
  // Anonieme Gregoriaanse berekening (Meeus/Jones/Butcher).
  const a = y % 19;
  const b = Math.floor(y / 100);
  const c = y % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toCivil(y, month, day);
}

/** Algemeen erkende feestdagen in Nederland (bouw: geen werkdag). */
export function holidays(y: number): Set<CivilDate> {
  const easter = easterSunday(y);
  let kingsDay = toCivil(y, 4, 27);
  if (weekday(kingsDay) === 0) kingsDay = toCivil(y, 4, 26);
  const set = new Set<CivilDate>([
    toCivil(y, 1, 1),
    addDays(easter, 1), // 2e paasdag
    kingsDay,
    addDays(easter, 39), // Hemelvaart
    addDays(easter, 50), // 2e pinksterdag
    toCivil(y, 12, 25),
    toCivil(y, 12, 26),
  ]);
  if (y % 5 === 0) set.add(toCivil(y, 5, 5)); // Bevrijdingsdag (lustrumjaar)
  return set;
}

export function isWorkday(c: CivilDate, extraNonWorkdays: Set<CivilDate> = new Set()): boolean {
  const wd = weekday(c);
  if (wd === 0 || wd === 6) return false;
  if (extraNonWorkdays.has(c)) return false;
  return !holidays(parseCivil(c).y).has(c);
}

/** Telt n werkdagen op (n mag negatief zijn). Start telt niet mee. */
export function addWorkdays(c: CivilDate, n: number, extra?: Set<CivilDate>): CivilDate {
  const step = n >= 0 ? 1 : -1;
  let left = Math.abs(n);
  let cur = c;
  while (left > 0) {
    cur = addDays(cur, step);
    if (isWorkday(cur, extra)) left--;
  }
  return cur;
}

/** Eerstvolgende werkdag op of na c. */
export function nextWorkday(c: CivilDate, extra?: Set<CivilDate>): CivilDate {
  let cur = c;
  while (!isWorkday(cur, extra)) cur = addDays(cur, 1);
  return cur;
}

/** Aantal werkdagen van a tot b (b - a), positief als b later is. */
export function workdaysBetween(a: CivilDate, b: CivilDate, extra?: Set<CivilDate>): number {
  if (a === b) return 0;
  const step = a < b ? 1 : -1;
  let n = 0;
  let cur = a;
  while (cur !== b) {
    cur = addDays(cur, step);
    if (isWorkday(cur, extra)) n += step;
  }
  return n;
}

// ---- Tijdzone Nederland ----

export const TZ = 'Europe/Amsterdam';

/** Kalenderdatum en tijd in Nederland voor een tijdstip. */
export function amsterdamParts(at: Date): { date: CivilDate; hour: number; minute: number } {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(f.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

/** Tijdstip (UTC) dat overeenkomt met datum + uur:minuut in Nederland. */
export function amsterdamTime(c: CivilDate, hour: number, minute = 0): Date {
  const { y, m, d } = parseCivil(c);
  // Eerst als UTC nemen, dan corrigeren met het werkelijke verschil.
  const guess = new Date(Date.UTC(y, m - 1, d, hour, minute));
  const p = amsterdamParts(guess);
  const shown = Date.UTC(
    Number(p.date.slice(0, 4)),
    Number(p.date.slice(5, 7)) - 1,
    Number(p.date.slice(8, 10)),
    p.hour,
    p.minute,
  );
  return new Date(guess.getTime() - (shown - guess.getTime()));
}
