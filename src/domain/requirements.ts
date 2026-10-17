import type { Evaluation, InputValues, ParamValues, RequirementDef } from './types';

/*
 * Technische eisen voor de aanleg van 20 kV-kabels (12/20 kV XLPE) in de grond.
 *
 * De standaardwaarden zijn gangbare uitgangspunten uit de praktijk van Nederlandse
 * netbeheerders en NEN-HD 620 / NEN 7171. Ze zijn per project aan te passen, omdat het
 * bestek en de specificatie van de netbeheerder altijd leidend zijn.
 */

function num(values: InputValues, key: string): number | undefined {
  const v = values[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function fmt(n: number, digits = 2): string {
  return n.toLocaleString('nl-NL', { maximumFractionDigits: digits });
}

/** Combineert deelcontroles: één fout = voldoet niet, één ontbrekend gegeven = onvolledig. */
function combine(parts: { ok: boolean | undefined; text: string }[]): Evaluation {
  const details = parts.map((p) => `${p.ok === undefined ? '…' : p.ok ? '✓' : '✗'} ${p.text}`);
  if (parts.some((p) => p.ok === false)) return { status: 'voldoet_niet', details };
  if (parts.some((p) => p.ok === undefined)) return { status: 'onvolledig', details };
  return { status: 'voldoet', details };
}

function minCheck(value: number | undefined, min: number, label: string, unit: string) {
  return {
    ok: value === undefined ? undefined : value >= min,
    text:
      value === undefined
        ? `${label}: nog niet ingevuld (eis ≥ ${fmt(min)} ${unit})`
        : `${label}: ${fmt(value)} ${unit} (eis ≥ ${fmt(min)} ${unit})`,
  };
}

function boolCheck(values: InputValues, key: string, label: string) {
  const v = values[key];
  return { ok: typeof v === 'boolean' ? v : undefined, text: label };
}

const LIGGING_OPTIONS = [
  { value: 'berm', label: 'Berm / trottoir / groen' },
  { value: 'rijbaan', label: 'Rijbaan / parkeerstrook' },
  { value: 'landbouw', label: 'Landbouwgrond' },
];

const LEIDING_OPTIONS = [
  { value: 'ms', label: 'MS-kabel' },
  { value: 'ls', label: 'LS-kabel' },
  { value: 'telecom', label: 'Telecom / glasvezel' },
  { value: 'gas', label: 'Gasleiding' },
  { value: 'water', label: 'Waterleiding' },
  { value: 'riool', label: 'Riolering' },
  { value: 'overig', label: 'Overig' },
];

export const REQUIREMENTS: RequirementDef[] = [
  {
    id: 'dekking',
    title: 'Gronddekking',
    category: 'grondwerk',
    description:
      'Meet de afstand van bovenkant kabel tot het (definitieve) maaiveld vóór het aanvullen.',
    reference: 'Netbeheerderspecificatie / NEN 7171-1',
    inputs: [
      { kind: 'select', key: 'ligging', label: 'Ligging', options: LIGGING_OPTIONS },
      { kind: 'number', key: 'dekking', label: 'Gemeten dekking', unit: 'm', hint: 'bovenkant kabel – maaiveld' },
    ],
    params: [
      { key: 'minBerm', label: 'Min. dekking berm/trottoir', unit: 'm', default: 0.8 },
      { key: 'minRijbaan', label: 'Min. dekking rijbaan', unit: 'm', default: 1.0 },
      { key: 'minLandbouw', label: 'Min. dekking landbouwgrond', unit: 'm', default: 1.0 },
    ],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      const ligging = values.ligging;
      const min =
        ligging === 'rijbaan' ? p.minRijbaan : ligging === 'landbouw' ? p.minLandbouw : ligging === 'berm' ? p.minBerm : undefined;
      if (min === undefined) return combine([{ ok: undefined, text: 'Ligging nog niet gekozen' }]);
      return combine([minCheck(num(values, 'dekking'), min, 'Dekking', 'm')]);
    },
  },
  {
    id: 'zandomhulling',
    title: 'Zandbed en omhulling',
    category: 'grondwerk',
    description: 'Kabel rondom in schoon, steenvrij zand: laagdikte onder en boven de kabel.',
    reference: 'NEN-HD 620 / netbeheerderspecificatie',
    inputs: [
      { kind: 'number', key: 'onder', label: 'Zandlaag onder kabel', unit: 'cm' },
      { kind: 'number', key: 'boven', label: 'Zandlaag boven kabel', unit: 'cm' },
      { kind: 'boolean', key: 'steenvrij', label: 'Zand schoon en vrij van stenen/puin' },
    ],
    params: [
      { key: 'minOnder', label: 'Min. zandlaag onder', unit: 'cm', default: 10 },
      { key: 'minBoven', label: 'Min. zandlaag boven', unit: 'cm', default: 10 },
    ],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      return combine([
        minCheck(num(values, 'onder'), p.minOnder, 'Zand onder', 'cm'),
        minCheck(num(values, 'boven'), p.minBoven, 'Zand boven', 'cm'),
        boolCheck(values, 'steenvrij', 'Zand schoon en steenvrij'),
      ]);
    },
  },
  {
    id: 'markering',
    title: 'Afdekking en markeringslint',
    category: 'grondwerk',
    description: 'Waarschuwingslint/afdekband boven de kabel op de voorgeschreven hoogte.',
    reference: 'Netbeheerderspecificatie',
    inputs: [
      { kind: 'boolean', key: 'aanwezig', label: 'Markeringslint / afdekband aangebracht' },
      { kind: 'number', key: 'hoogte', label: 'Hoogte lint boven kabel', unit: 'cm' },
    ],
    params: [
      { key: 'minHoogte', label: 'Min. hoogte boven kabel', unit: 'cm', default: 20 },
      { key: 'maxHoogte', label: 'Max. hoogte boven kabel', unit: 'cm', default: 40 },
    ],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      const h = num(values, 'hoogte');
      return combine([
        boolCheck(values, 'aanwezig', 'Lint/afdekband aangebracht'),
        {
          ok: h === undefined ? undefined : h >= p.minHoogte && h <= p.maxHoogte,
          text:
            h === undefined
              ? `Hoogte: nog niet ingevuld (eis ${fmt(p.minHoogte)}–${fmt(p.maxHoogte)} cm)`
              : `Hoogte: ${fmt(h)} cm (eis ${fmt(p.minHoogte)}–${fmt(p.maxHoogte)} cm)`,
        },
      ]);
    },
  },
  {
    id: 'kruising',
    title: 'Kruising met kabel/leiding',
    category: 'grondwerk',
    description: 'Verticale afstand bij het kruisen van een andere kabel of leiding.',
    reference: 'NEN 7171-1 / afspraken met leidingeigenaar',
    inputs: [
      { kind: 'select', key: 'leiding', label: 'Gekruiste leiding', options: LEIDING_OPTIONS },
      { kind: 'number', key: 'afstand', label: 'Verticale afstand', unit: 'm' },
      { kind: 'boolean', key: 'bescherming', label: 'Scheidingsplaat/mantelbuis toegepast' },
    ],
    params: [{ key: 'minAfstand', label: 'Min. verticale afstand', unit: 'm', default: 0.2 }],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      const a = num(values, 'afstand');
      const beschermd = values.bescherming === true;
      const parts = [
        { ok: typeof values.leiding === 'string' ? true : undefined, text: 'Gekruiste leiding vastgelegd' },
        minCheck(a, p.minAfstand, 'Verticale afstand', 'm'),
      ];
      if (a !== undefined && a < p.minAfstand && beschermd) {
        parts[1] = { ok: true, text: `${parts[1].text} – onderschreden, gecompenseerd met scheidingsplaat/mantelbuis` };
      }
      return combine(parts);
    },
  },
  {
    id: 'parallel',
    title: 'Parallelligging',
    category: 'grondwerk',
    description: 'Horizontale afstand tot parallel liggende kabels en leidingen.',
    reference: 'NEN 7171-1 / netbeheerderspecificatie',
    inputs: [
      { kind: 'select', key: 'leiding', label: 'Parallelle leiding', options: LEIDING_OPTIONS },
      { kind: 'number', key: 'afstand', label: 'Horizontale afstand (hart–hart)', unit: 'm' },
    ],
    params: [{ key: 'minAfstand', label: 'Min. horizontale afstand', unit: 'm', default: 0.3 }],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      return combine([
        { ok: typeof values.leiding === 'string' ? true : undefined, text: 'Parallelle leiding vastgelegd' },
        minCheck(num(values, 'afstand'), p.minAfstand, 'Horizontale afstand', 'm'),
      ]);
    },
  },
  {
    id: 'buigstraal',
    title: 'Buigstraal',
    category: 'elektro',
    description: 'Kleinste buigstraal in bochten en bij invoering, getoetst aan n × buitendiameter.',
    reference: 'NEN-HD 620 / opgave kabelfabrikant',
    inputs: [
      { kind: 'number', key: 'diameter', label: 'Buitendiameter kabel (D)', unit: 'mm' },
      { kind: 'number', key: 'straal', label: 'Gemeten buigstraal (R)', unit: 'mm' },
    ],
    params: [{ key: 'factor', label: 'Min. buigstraal (× D)', unit: '× D', default: 15 }],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      const d = num(values, 'diameter');
      if (d === undefined) return combine([{ ok: undefined, text: 'Buitendiameter nog niet ingevuld' }]);
      return combine([minCheck(num(values, 'straal'), p.factor * d, `Buigstraal (${fmt(p.factor)} × ${fmt(d)} mm)`, 'mm')]);
    },
  },
  {
    id: 'trekkracht',
    title: 'Trekkracht bij intrekken',
    category: 'elektro',
    description: 'Maximaal geregistreerde trekkracht, getoetst aan de toelaatbare trekspanning op de geleider.',
    reference: 'NEN-HD 620 / opgave kabelfabrikant',
    inputs: [
      {
        kind: 'select',
        key: 'materiaal',
        label: 'Geleidermateriaal',
        options: [
          { value: 'al', label: 'Aluminium' },
          { value: 'cu', label: 'Koper' },
        ],
      },
      { kind: 'number', key: 'doorsnede', label: 'Doorsnede per geleider', unit: 'mm²' },
      { kind: 'number', key: 'aders', label: 'Aantal getrokken geleiders', unit: 'st' },
      { kind: 'number', key: 'kracht', label: 'Max. gemeten trekkracht', unit: 'kN' },
    ],
    params: [
      { key: 'sigmaAl', label: 'Toelaatbare trekspanning Al', unit: 'N/mm²', default: 30 },
      { key: 'sigmaCu', label: 'Toelaatbare trekspanning Cu', unit: 'N/mm²', default: 50 },
    ],
    minPhotos: 1,
    beforeBackfill: false,
    evaluate(values, p) {
      const sigma = values.materiaal === 'al' ? p.sigmaAl : values.materiaal === 'cu' ? p.sigmaCu : undefined;
      const a = num(values, 'doorsnede');
      const n = num(values, 'aders');
      const f = num(values, 'kracht');
      if (sigma === undefined || a === undefined || n === undefined) {
        return combine([{ ok: undefined, text: 'Materiaal, doorsnede en aantal geleiders invullen' }]);
      }
      const maxKn = (sigma * a * n) / 1000;
      return combine([
        {
          ok: f === undefined ? undefined : f <= maxKn,
          text:
            f === undefined
              ? `Trekkracht: nog niet ingevuld (max ${fmt(maxKn)} kN)`
              : `Trekkracht: ${fmt(f)} kN (max ${fmt(maxKn)} kN = ${fmt(sigma)} N/mm² × ${fmt(a)} mm² × ${fmt(n)})`,
        },
      ]);
    },
  },
  {
    id: 'legtemperatuur',
    title: 'Legtemperatuur',
    category: 'elektro',
    description: 'Kabeltemperatuur tijdens het leggen en buigen.',
    reference: 'NEN-HD 620 / opgave kabelfabrikant',
    inputs: [{ kind: 'number', key: 'temperatuur', label: 'Temperatuur kabel/omgeving', unit: '°C' }],
    params: [{ key: 'minTemp', label: 'Min. legtemperatuur', unit: '°C', default: -5 }],
    minPhotos: 0,
    beforeBackfill: false,
    evaluate(values, p) {
      return combine([minCheck(num(values, 'temperatuur'), p.minTemp, 'Temperatuur', '°C')]);
    },
  },
  {
    id: 'mof',
    title: 'Mof / eindsluiting montage',
    category: 'elektro',
    description: 'Controle op de montage van een verbindings- of eindmof volgens de montagehandleiding.',
    reference: 'Montagehandleiding fabrikant / NEN 3840',
    inputs: [
      { kind: 'text', key: 'mofnummer', label: 'Mofnummer / positie', hint: 'bijv. M3 – km 0+450' },
      { kind: 'text', key: 'type', label: 'Type mofset en batchnummer' },
      { kind: 'text', key: 'monteur', label: 'Monteur (gekwalificeerd)' },
      { kind: 'boolean', key: 'handleiding', label: 'Montagehandleiding gevolgd, maatvoering afstrippen gecontroleerd' },
      { kind: 'boolean', key: 'persing', label: 'Verbinders geperst met juiste matrijs en aantal persingen' },
      { kind: 'boolean', key: 'krimp', label: 'Krimp/koudkrimp volledig, zonder luchtinsluitingen' },
      { kind: 'boolean', key: 'scherm', label: 'Aardscherm doorverbonden en afgedicht' },
      { kind: 'boolean', key: 'mofput', label: 'Mofput uitgevlakt, mof ondersteund en vrij van trek' },
    ],
    params: [],
    minPhotos: 3,
    beforeBackfill: true,
    evaluate(values) {
      const text = (key: string, label: string) => ({
        ok: typeof values[key] === 'string' && (values[key] as string).trim() !== '' ? true : undefined,
        text: `${label} vastgelegd`,
      });
      return combine([
        text('mofnummer', 'Mofnummer'),
        text('type', 'Type mofset'),
        text('monteur', 'Monteur'),
        boolCheck(values, 'handleiding', 'Handleiding en maatvoering'),
        boolCheck(values, 'persing', 'Persverbindingen'),
        boolCheck(values, 'krimp', 'Krimp zonder luchtinsluitingen'),
        boolCheck(values, 'scherm', 'Aardscherm doorverbonden'),
        boolCheck(values, 'mofput', 'Mofput en ondersteuning'),
      ]);
    },
  },
  {
    id: 'mantelproef',
    title: 'Mantelbeproeving',
    category: 'elektro',
    description: 'DC-spanningsproef op de buitenmantel na het leggen, vóór het aanvullen.',
    reference: 'NEN-HD 620 / IEC 60229',
    inputs: [
      { kind: 'number', key: 'spanning', label: 'Proefspanning DC', unit: 'kV' },
      { kind: 'number', key: 'duur', label: 'Proefduur', unit: 'min' },
      { kind: 'boolean', key: 'geenDoorslag', label: 'Geen doorslag, lekstroom stabiel' },
    ],
    params: [
      { key: 'minSpanning', label: 'Min. proefspanning', unit: 'kV', default: 5 },
      { key: 'minDuur', label: 'Min. proefduur', unit: 'min', default: 1 },
    ],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      return combine([
        minCheck(num(values, 'spanning'), p.minSpanning, 'Proefspanning', 'kV'),
        minCheck(num(values, 'duur'), p.minDuur, 'Proefduur', 'min'),
        boolCheck(values, 'geenDoorslag', 'Geen doorslag'),
      ]);
    },
  },
  {
    id: 'vlf',
    title: 'Hoogspanningsbeproeving (VLF)',
    category: 'elektro',
    description: 'VLF-beproeving (0,1 Hz) van het complete kabeltracé inclusief moffen.',
    reference: 'NEN-HD 620 / netbeheerderspecificatie',
    inputs: [
      { kind: 'number', key: 'spanning', label: 'Proefspanning (U)', unit: 'kV' },
      { kind: 'number', key: 'duur', label: 'Proefduur', unit: 'min' },
      { kind: 'boolean', key: 'geenDoorslag', label: 'Geen doorslag in alle fasen' },
    ],
    params: [
      { key: 'u0', label: 'U0 van de kabel', unit: 'kV', default: 12 },
      { key: 'factor', label: 'Proefspanning (× U0)', unit: '× U0', default: 3 },
      { key: 'minDuur', label: 'Min. proefduur', unit: 'min', default: 30 },
    ],
    minPhotos: 1,
    beforeBackfill: false,
    evaluate(values, p) {
      return combine([
        minCheck(num(values, 'spanning'), p.u0 * p.factor, `Proefspanning (${fmt(p.factor)} × U0)`, 'kV'),
        minCheck(num(values, 'duur'), p.minDuur, 'Proefduur', 'min'),
        boolCheck(values, 'geenDoorslag', 'Geen doorslag'),
      ]);
    },
  },
];

export const DEFAULT_REQUIRED_CHECKS = ['dekking', 'zandomhulling', 'markering', 'buigstraal', 'mantelproef'];

export function getRequirement(id: string): RequirementDef {
  const req = REQUIREMENTS.find((r) => r.id === id);
  if (!req) throw new Error(`Onbekende eis: ${id}`);
  return req;
}

/** Standaardwaarden van een eis, overschreven met de projectwaarden. */
export function resolveParams(req: RequirementDef, overrides?: ParamValues): ParamValues {
  const params: ParamValues = {};
  for (const def of req.params) {
    const o = overrides?.[def.key];
    params[def.key] = typeof o === 'number' && Number.isFinite(o) ? o : def.default;
  }
  return params;
}

/** Beoordeling inclusief de eis aan het minimum aantal foto's als bewijs. */
export function evaluateRegistration(
  req: RequirementDef,
  values: InputValues,
  params: ParamValues,
  photoCount: number,
): Evaluation {
  const base = req.evaluate(values, params);
  if (req.minPhotos === 0) return base;
  const enough = photoCount >= req.minPhotos;
  const details = [...base.details, `${enough ? '✓' : '…'} Foto's: ${photoCount} van min. ${req.minPhotos}`];
  if (base.status === 'voldoet' && !enough) return { status: 'onvolledig', details };
  return { status: base.status, details };
}
