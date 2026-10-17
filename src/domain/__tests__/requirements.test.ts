import { evaluateRegistration, getRequirement, REQUIREMENTS, resolveParams } from '../requirements';
import { registrationRole, sectionState } from '../status';
import type { Registration, Section } from '../types';

function evaluate(id: string, values: Record<string, number | boolean | string>, photos = 5, overrides?: Record<string, number>) {
  const req = getRequirement(id);
  return evaluateRegistration(req, values, resolveParams(req, overrides), photos);
}

describe('eisen', () => {
  it('heeft unieke ids en complete standaardwaarden', () => {
    const ids = REQUIREMENTS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const r of REQUIREMENTS) {
      expect(r.evaluate({}, resolveParams(r)).status).toBe('onvolledig');
    }
  });

  it('toetst de gronddekking per ligging', () => {
    expect(evaluate('dekking', { ligging: 'berm', dekking: 0.85 }).status).toBe('voldoet');
    expect(evaluate('dekking', { ligging: 'rijbaan', dekking: 0.85 }).status).toBe('voldoet_niet');
    expect(evaluate('dekking', { ligging: 'rijbaan', dekking: 1.0 }).status).toBe('voldoet');
    expect(evaluate('dekking', { dekking: 1.2 }).status).toBe('onvolledig');
  });

  it('gebruikt projectwaarden boven standaardwaarden', () => {
    expect(evaluate('dekking', { ligging: 'berm', dekking: 0.85 }, 5, { minBerm: 0.9 }).status).toBe('voldoet_niet');
  });

  it('vraagt het minimum aantal fotos als bewijs', () => {
    expect(evaluate('dekking', { ligging: 'berm', dekking: 0.9 }, 0).status).toBe('onvolledig');
    expect(evaluate('dekking', { ligging: 'berm', dekking: 0.5 }, 0).status).toBe('voldoet_niet');
  });

  it('toetst de buigstraal aan de fabrikantwaarde, of de strengere netbeheerderseis', () => {
    const base = { kabeltype: '3x1x240 Al', factorFabrikant: 15, diameter: 40 };
    expect(evaluate('buigstraal', { ...base, straal: 600 }).status).toBe('voldoet');
    expect(evaluate('buigstraal', { ...base, straal: 590 }).status).toBe('voldoet_niet');
    expect(evaluate('buigstraal', { ...base, straal: 600 }, 5, { factorNetbeheerder: 20 }).status).toBe('voldoet_niet');
    expect(evaluate('buigstraal', { ...base, straal: 800 }, 5, { factorNetbeheerder: 20 }).status).toBe('voldoet');
    expect(evaluate('buigstraal', { diameter: 40, straal: 800 }).status).toBe('onvolledig');
  });

  it('toetst de binnendiameter en afdichting van een mantelbuis', () => {
    const base = { kabeldiameter: 80, lengte: 12, doorgang: true, afgedicht: true };
    expect(evaluate('mantelbuis', { ...base, binnendiameter: 125 }).status).toBe('voldoet');
    expect(evaluate('mantelbuis', { ...base, binnendiameter: 110 }).status).toBe('voldoet_niet');
    expect(evaluate('mantelbuis', { ...base, binnendiameter: 125, afgedicht: false }).status).toBe('voldoet_niet');
  });

  it('toetst de nauwkeurigheid van de inmeting', () => {
    const base = { punt: 'P1', x: 155000, y: 463000, z: -0.9, methode: 'rtk' };
    expect(evaluate('inmeting', { ...base, nauwkeurigheid: 3 }).status).toBe('voldoet');
    expect(evaluate('inmeting', { ...base, nauwkeurigheid: 8 }).status).toBe('voldoet_niet');
    expect(evaluate('inmeting', { punt: 'P1', nauwkeurigheid: 3 }).status).toBe('onvolledig');
  });

  it('toetst laagdikte en verdichtingsgraad', () => {
    const base = { methode: 'trilplaat', herstel: true };
    expect(evaluate('verdichting', { ...base, laagdikte: 30, verdichtingsgraad: 96 }).status).toBe('voldoet');
    expect(evaluate('verdichting', { ...base, laagdikte: 40, verdichtingsgraad: 96 }).status).toBe('voldoet_niet');
  });

  it('toetst de aardverspreidingsweerstand', () => {
    const base = { locatie: 'RS 12', meetmethode: 'driepuntsmeting', schermen: true };
    expect(evaluate('aarding', { ...base, weerstand: 2.5 }).status).toBe('voldoet');
    expect(evaluate('aarding', { ...base, weerstand: 4 }).status).toBe('voldoet_niet');
  });

  it('berekent de toelaatbare trekkracht', () => {
    // 30 N/mm² × 240 mm² × 3 = 21,6 kN
    expect(evaluate('trekkracht', { materiaal: 'al', doorsnede: 240, aders: 3, kracht: 21.6 }).status).toBe('voldoet');
    expect(evaluate('trekkracht', { materiaal: 'al', doorsnede: 240, aders: 3, kracht: 22 }).status).toBe('voldoet_niet');
    expect(evaluate('trekkracht', { materiaal: 'cu', doorsnede: 240, aders: 3, kracht: 22 }).status).toBe('voldoet');
  });

  it('accepteert een te kleine kruisingsafstand alleen met bescherming', () => {
    expect(evaluate('kruising', { leiding: 'gas', afstand: 0.1, bescherming: false }).status).toBe('voldoet_niet');
    expect(evaluate('kruising', { leiding: 'gas', afstand: 0.1, bescherming: true }).status).toBe('voldoet');
  });

  it('toetst de VLF-proefspanning aan 3 × U0', () => {
    expect(evaluate('vlf', { spanning: 36, duur: 30, geenDoorslag: true }).status).toBe('voldoet');
    expect(evaluate('vlf', { spanning: 35, duur: 30, geenDoorslag: true }).status).toBe('voldoet_niet');
  });

  it('keurt een mof met een afgekeurd controlepunt af', () => {
    const base = { mofnummer: 'M1', type: 'X', monteur: 'Jan', handleiding: true, persing: true, krimp: true, scherm: true, mofput: true };
    expect(evaluate('mof', base).status).toBe('voldoet');
    expect(evaluate('mof', { ...base, krimp: false }).status).toBe('voldoet_niet');
  });
});

describe('vrijgave aanvullen', () => {
  const section: Section = {
    id: 's1',
    projectId: 'p1',
    name: 'Sectie 1',
    from: '0+000',
    to: '0+050',
    requiredChecks: ['dekking', 'trekkracht'],
    createdAt: '2026-01-01T00:00:00.000Z',
  };
  const reg = (checkId: string, status: Registration['evaluation']['status'], recordedAt: string): Registration => ({
    id: `${checkId}-${recordedAt}`,
    sectionId: 's1',
    checkId,
    values: {},
    params: {},
    evaluation: { status, details: [] },
    photos: [],
    location: null,
    recordedBy: 'test',
    recordedAt,
    remark: '',
  });

  it('wacht alleen op eisen die vóór het aanvullen gelden', () => {
    const state = sectionState(section, [reg('dekking', 'voldoet', '2026-01-02')]);
    expect(state.readyForBackfill).toBe(true);
    expect(state.complete).toBe(false);
  });

  it('gebruikt de laatste registratie per eis', () => {
    const state = sectionState(section, [reg('dekking', 'voldoet', '2026-01-02'), reg('dekking', 'voldoet_niet', '2026-01-03')]);
    expect(state.readyForBackfill).toBe(false);
    expect(state.failed).toBe(1);
  });
});

describe('intrekken', () => {
  const r = (id: string, recordedAt: string, withdrawn?: boolean): Registration => ({
    id,
    sectionId: 's1',
    checkId: 'dekking',
    values: {},
    params: {},
    evaluation: { status: 'voldoet', details: [] },
    photos: [],
    location: null,
    recordedBy: 'test',
    recordedAt,
    remark: '',
    withdrawn: withdrawn ? { by: 'WV', at: '2026-01-05', reason: 'verkeerde sectie' } : undefined,
  });

  it('laat een ingetrokken registratie niet meetellen, maar bewaart haar', () => {
    const all = [r('a', '2026-01-02'), r('b', '2026-01-03', true)];
    expect(registrationRole(all[0], all)).toBe('actueel');
    expect(registrationRole(all[1], all)).toBe('ingetrokken');
    expect(registrationRole(r('c', '2026-01-01'), [...all, r('c', '2026-01-01')])).toBe('vervangen');
  });
});
