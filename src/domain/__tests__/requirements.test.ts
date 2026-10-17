import { evaluateRegistration, getRequirement, REQUIREMENTS, resolveParams } from '../requirements';
import { sectionState } from '../status';
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

  it('berekent de minimale buigstraal uit de kabeldiameter', () => {
    expect(evaluate('buigstraal', { diameter: 40, straal: 600 }).status).toBe('voldoet');
    expect(evaluate('buigstraal', { diameter: 40, straal: 590 }).status).toBe('voldoet_niet');
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
