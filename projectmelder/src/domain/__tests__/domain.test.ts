import { bucketFor, defaultDeadline, dueReminders, isQuietTime, reminderSchedule } from '../deadlines';
import { formatPhone, isValidPhone, normalizePhone, toE164 } from '../phone';
import { allowedTransitions, initialStatus, isClosed, STATUSES, TRANSITIONS } from '../status';
import { findOwner, parseDueDate, suggestLocally } from '../suggest';
import { ITEM_TYPES } from '../types';
import { addWorkdays, amsterdamParts, amsterdamTime, holidays, isWorkday, workdaysBetween } from '../workdays';

// Maandag 19 oktober 2026, 10:00 Nederlandse tijd
const NOW = amsterdamTime('2026-10-19', 10);

describe('werkdagen', () => {
  it('slaat weekend en feestdagen over', () => {
    expect(addWorkdays('2026-10-23', 1)).toBe('2026-10-26'); // vrijdag -> maandag
    expect(isWorkday('2026-12-25')).toBe(false);
    expect(isWorkday('2026-04-06')).toBe(false); // 2e paasdag 2026
    expect(holidays(2026).has('2026-05-14')).toBe(true); // Hemelvaart 2026
    expect(addWorkdays('2026-12-24', 1)).toBe('2026-12-28');
  });

  it('telt werkdagen tussen datums', () => {
    expect(workdaysBetween('2026-10-19', '2026-10-26')).toBe(5);
    expect(workdaysBetween('2026-10-26', '2026-10-19')).toBe(-5);
  });

  it('rekent in Nederlandse tijd, ook rond zomertijd', () => {
    expect(amsterdamTime('2026-10-19', 7).toISOString()).toBe('2026-10-19T05:00:00.000Z');
    expect(amsterdamTime('2026-11-02', 7).toISOString()).toBe('2026-11-02T06:00:00.000Z');
    expect(amsterdamParts(new Date('2026-10-19T22:30:00Z')).date).toBe('2026-10-20');
  });
});

describe('termijnen', () => {
  it('geeft standaardtermijnen per type en ernst', () => {
    expect(amsterdamParts(defaultDeadline('actie', 'normaal', NOW)!).date).toBe('2026-10-26');
    expect(amsterdamParts(defaultDeadline('vraag', 'normaal', NOW)!).date).toBe('2026-10-21');
    expect(defaultDeadline('afwijking', 'kritiek', NOW)!.getTime() - NOW.getTime()).toBe(24 * 3600 * 1000);
    expect(amsterdamParts(defaultDeadline('afwijking', 'laag', NOW)!).date).toBe('2026-11-02');
    expect(defaultDeadline('besluit', 'normaal', NOW)).toBeNull();
  });

  it('deelt in bakjes in', () => {
    expect(bucketFor(null, NOW)).toBe('geen');
    expect(bucketFor(amsterdamTime('2026-10-19', 9), NOW)).toBe('te_laat');
    expect(bucketFor(amsterdamTime('2026-10-19', 17), NOW)).toBe('vandaag');
    expect(bucketFor(amsterdamTime('2026-10-23', 17), NOW)).toBe('deze_week');
    expect(bucketFor(amsterdamTime('2026-11-23', 17), NOW)).toBe('later');
  });

  it('plant herinneringen en escalatie', () => {
    const due = amsterdamTime('2026-10-28', 17); // woensdag
    const s = reminderSchedule(due, NOW);
    expect(s.map((r) => [r.kind, amsterdamParts(r.at).date, amsterdamParts(r.at).hour])).toEqual([
      ['voor', '2026-10-26', 7],
      ['op_dag', '2026-10-28', 7],
      ['na', '2026-10-29', 7],
      ['escalatie', '2026-10-30', 7],
    ]);
    const since = amsterdamTime('2026-10-28', 6);
    const now = amsterdamTime('2026-10-28', 7, 5);
    expect(dueReminders(due, NOW, since, now).map((r) => r.kind)).toEqual(['op_dag']);
  });

  it('respecteert stille uren behalve bij kritiek', () => {
    expect(isQuietTime(amsterdamTime('2026-10-24', 10), 'normaal')).toBe(true); // zaterdag
    expect(isQuietTime(amsterdamTime('2026-10-24', 10), 'kritiek')).toBe(false);
    expect(isQuietTime(amsterdamTime('2026-10-19', 6), 'hoog')).toBe(true);
    expect(isQuietTime(NOW, 'normaal')).toBe(false);
  });
});

describe('statusmodellen', () => {
  it('heeft voor elk type een geldig model', () => {
    for (const type of ITEM_TYPES) {
      const keys = STATUSES[type].map((s) => s.key);
      expect(keys.length).toBeGreaterThan(1);
      expect(isClosed(type, initialStatus(type))).toBe(false);
      for (const t of TRANSITIONS[type]) {
        expect(keys).toContain(t.from);
        expect(keys).toContain(t.to);
      }
    }
  });

  it('laat een monteur zijn toegewezen actie gereed melden maar niet zelf accepteren', () => {
    const ctx = { userId: 'm', role: 'monteur' as const, ownerId: 'm', createdBy: 'u' };
    expect(allowedTransitions('actie', 'nieuw', ctx).map((t) => t.to)).toEqual(['opgepakt', 'gereed_gemeld']);
    expect(allowedTransitions('actie', 'gereed_gemeld', ctx)).toEqual([]);
  });

  it('laat herstel van een afwijking niet door de hersteller verifiëren', () => {
    const owner = { userId: 'u', role: 'uitvoerder' as const, ownerId: 'u', createdBy: 'x' };
    const other = { userId: 'w', role: 'werkverantwoordelijke' as const, ownerId: 'u', createdBy: 'x' };
    expect(allowedTransitions('afwijking', 'hersteld', owner).map((t) => t.to)).toEqual(['maatregel']);
    expect(allowedTransitions('afwijking', 'hersteld', other).map((t) => t.to)).toEqual(['geverifieerd', 'maatregel']);
  });
});

describe('telefoonnummers', () => {
  it('normaliseert Nederlandse en internationale nummers', () => {
    expect(normalizePhone('06-12345678')).toBe('31612345678');
    expect(normalizePhone('+31 6 1234 5678')).toBe('31612345678');
    expect(normalizePhone('0049 170 1234567')).toBe('491701234567');
    expect(toE164('0612345678')).toBe('+31612345678');
    expect(isValidPhone('06123')).toBe(false);
    expect(formatPhone('31612345678')).toBe('+31 6 1234 5678');
  });
});

describe('lokaal voorstel uit spraak', () => {
  const members = [
    { user_id: 'p1', full_name: 'Piet Pietersen', role: 'oa_voorman', organisation_name: 'De Vries Infra' },
    { user_id: 'k1', full_name: 'Karin de Boer', role: 'uitvoerder', organisation_name: 'Eigen' },
  ];

  it('herkent datums', () => {
    expect(parseDueDate('graag morgen', NOW)).toBe('2026-10-20');
    expect(parseDueDate('voor donderdag herstellen', NOW)).toBe('2026-10-21');
    expect(parseDueDate('uiterlijk donderdag', NOW)).toBe('2026-10-22');
    expect(parseDueDate('over twee weken', NOW)).toBe('2026-11-02');
    expect(parseDueDate('over 3 werkdagen', NOW)).toBe('2026-10-22');
    expect(parseDueDate('op 3 november', NOW)).toBe('2026-11-03');
    expect(parseDueDate('op 5-1', NOW)).toBe('2027-01-05');
    expect(parseDueDate('eind van de week', NOW)).toBe('2026-10-23');
    expect(parseDueDate('geen datum', NOW)).toBeNull();
  });

  it('herkent eigenaar op achternaam', () => {
    expect(findOwner('Pietersen moet dit oppakken', members)).toBe('p1');
    expect(findOwner('vraag het aan Karin', members)).toBe('k1');
    expect(findOwner('niemand genoemd', members)).toBeNull();
  });

  it('maakt een volledig voorstel', () => {
    const s = suggestLocally(
      'Afwijking bij mofput 12: de kabel ligt maar zeventig centimeter diep. Pietersen moet dit vóór donderdag herstellen, urgent.',
      members,
      NOW,
    );
    expect(s.type).toBe('afwijking');
    expect(s.severity).toBe('hoog');
    expect(s.owner_id).toBe('p1');
    expect(s.location_label).toBe('mofput 12');
    expect(amsterdamParts(new Date(s.due_at!)).date).toBe('2026-10-21');
    expect(s.title).toBe('Bij mofput 12: de kabel ligt maar zeventig centimeter diep.');
  });
});
