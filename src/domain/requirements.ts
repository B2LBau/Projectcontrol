import type { Evaluation, InputValues, ParamValues, RequirementDef } from './types';

/*
 * Technische eisen voor de aanleg van 20 kV-kabels (12/20 kV XLPE) in de grond.
 *
 * De standaardwaarden vormen de normset "Liander". Het zijn gangbare uitgangspunten uit de
 * praktijk en NEN-HD 620 / NEN 7171 die nog met de Liander-specificatie geverifieerd moeten
 * worden. Ze zijn per project aan te passen; het bestek en de specificatie van de
 * netbeheerder zijn altijd leidend.
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

function textCheck(values: InputValues, key: string, label: string) {
  const v = values[key];
  return { ok: typeof v === 'string' && v.trim() !== '' ? true : undefined, text: `${label} vastgelegd` };
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
    id: 'mantelbuis',
    title: 'Mantelbuis',
    category: 'grondwerk',
    description: 'Mantelbuis bij kruisingen en invoeringen: maatvoering, doorgang en waterdichte afdichting van de buiseinden.',
    reference: 'Netbeheerderspecificatie / NEN 3650-3651 bij waterkeringen',
    inputs: [
      { kind: 'number', key: 'binnendiameter', label: 'Binnendiameter mantelbuis', unit: 'mm' },
      { kind: 'number', key: 'kabeldiameter', label: 'Buitendiameter kabel (bundel)', unit: 'mm' },
      { kind: 'number', key: 'lengte', label: 'Lengte mantelbuis', unit: 'm' },
      { kind: 'boolean', key: 'doorgang', label: 'Doorgang gecontroleerd, geen scherpe randen of vervorming' },
      { kind: 'boolean', key: 'afgedicht', label: 'Buiseinden na intrekken waterdicht afgedicht' },
    ],
    params: [{ key: 'factor', label: 'Min. binnendiameter (× kabeldiameter)', unit: '×', default: 1.5 }],
    minPhotos: 2,
    beforeBackfill: true,
    evaluate(values, p) {
      const k = num(values, 'kabeldiameter');
      return combine([
        k === undefined
          ? { ok: undefined, text: 'Kabeldiameter nog niet ingevuld' }
          : minCheck(num(values, 'binnendiameter'), p.factor * k, `Binnendiameter (${fmt(p.factor)} × ${fmt(k)} mm)`, 'mm'),
        { ok: num(values, 'lengte') === undefined ? undefined : true, text: 'Lengte vastgelegd' },
        boolCheck(values, 'doorgang', 'Doorgang gecontroleerd'),
        boolCheck(values, 'afgedicht', 'Buiseinden waterdicht afgedicht'),
      ]);
    },
  },
  {
    id: 'inmeting',
    title: 'Inmeting ligging (x, y, z)',
    category: 'grondwerk',
    description:
      'Inmeting van bovenkant kabel in RD-coördinaten en NAP-hoogte voor de revisie, vóór het aanvullen. GPS van de telefoon is hiervoor niet nauwkeurig genoeg.',
    reference: 'Netbeheerderspecificatie / WIBON',
    inputs: [
      { kind: 'text', key: 'punt', label: 'Puntnummer / omschrijving', hint: 'bijv. P12 bocht km 0+120' },
      { kind: 'number', key: 'x', label: 'X (RD)', unit: 'm' },
      { kind: 'number', key: 'y', label: 'Y (RD)', unit: 'm' },
      { kind: 'number', key: 'z', label: 'Z bovenkant kabel (NAP)', unit: 'm' },
      {
        kind: 'select',
        key: 'methode',
        label: 'Meetmethode',
        options: [
          { value: 'rtk', label: 'GNSS-RTK' },
          { value: 'tachymeter', label: 'Tachymeter' },
          { value: 'overig', label: 'Overig' },
        ],
      },
      { kind: 'number', key: 'nauwkeurigheid', label: 'Opgegeven nauwkeurigheid', unit: 'cm' },
    ],
    params: [{ key: 'maxNauwkeurigheid', label: 'Max. meetonnauwkeurigheid', unit: 'cm', default: 5 }],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      const acc = num(values, 'nauwkeurigheid');
      return combine([
        textCheck(values, 'punt', 'Puntnummer'),
        { ok: [num(values, 'x'), num(values, 'y'), num(values, 'z')].every((v) => v !== undefined) ? true : undefined, text: 'X, Y en Z vastgelegd' },
        { ok: typeof values.methode === 'string' ? true : undefined, text: 'Meetmethode vastgelegd' },
        {
          ok: acc === undefined ? undefined : acc <= p.maxNauwkeurigheid,
          text:
            acc === undefined
              ? `Nauwkeurigheid: nog niet ingevuld (eis ≤ ${fmt(p.maxNauwkeurigheid)} cm)`
              : `Nauwkeurigheid: ${fmt(acc)} cm (eis ≤ ${fmt(p.maxNauwkeurigheid)} cm)`,
        },
      ]);
    },
  },
  {
    id: 'verdichting',
    title: 'Aanvulling en verdichting',
    category: 'grondwerk',
    description: 'Aanvullen in lagen en verdichten; vast te leggen tijdens en direct na het aanvullen.',
    reference: 'Bestek / CROW / eisen wegbeheerder',
    inputs: [
      { kind: 'number', key: 'laagdikte', label: 'Max. laagdikte per verdichtingslaag', unit: 'cm' },
      { kind: 'text', key: 'methode', label: 'Verdichtingsmiddel', hint: 'bijv. trilplaat 150 kg' },
      { kind: 'number', key: 'verdichtingsgraad', label: 'Gemeten verdichtingsgraad (Proctor)', unit: '%' },
      { kind: 'boolean', key: 'herstel', label: 'Bovenlaag / verharding hersteld' },
    ],
    params: [
      { key: 'maxLaag', label: 'Max. laagdikte', unit: 'cm', default: 30 },
      { key: 'minVerdichting', label: 'Min. verdichtingsgraad', unit: '%', default: 95 },
    ],
    minPhotos: 1,
    beforeBackfill: false,
    evaluate(values, p) {
      const laag = num(values, 'laagdikte');
      return combine([
        {
          ok: laag === undefined ? undefined : laag <= p.maxLaag,
          text: laag === undefined ? `Laagdikte: nog niet ingevuld (eis ≤ ${fmt(p.maxLaag)} cm)` : `Laagdikte: ${fmt(laag)} cm (eis ≤ ${fmt(p.maxLaag)} cm)`,
        },
        textCheck(values, 'methode', 'Verdichtingsmiddel'),
        minCheck(num(values, 'verdichtingsgraad'), p.minVerdichting, 'Verdichtingsgraad', '%'),
        boolCheck(values, 'herstel', 'Bovenlaag hersteld'),
      ]);
    },
  },
  {
    id: 'buigstraal',
    title: 'Buigstraal',
    category: 'elektro',
    description:
      'Kleinste buigstraal in bochten en bij invoering, getoetst aan de minimale buigstraal van de fabrikant voor dit kabeltype.',
    reference: 'Opgave kabelfabrikant / NEN-HD 620 (later aangevuld met Liander-eis)',
    inputs: [
      { kind: 'text', key: 'kabeltype', label: 'Kabeltype', hint: 'bijv. 3x1x240 Al XLPE 12/20 kV' },
      { kind: 'number', key: 'factorFabrikant', label: 'Min. buigstraal volgens fabrikant', unit: '× D' },
      { kind: 'number', key: 'diameter', label: 'Buitendiameter kabel (D)', unit: 'mm' },
      { kind: 'number', key: 'straal', label: 'Gemeten buigstraal (R)', unit: 'mm' },
    ],
    params: [{ key: 'factorNetbeheerder', label: 'Min. buigstraal netbeheerder (0 = nog geen eis)', unit: '× D', default: 0 }],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values, p) {
      const d = num(values, 'diameter');
      const fab = num(values, 'factorFabrikant');
      const parts = [
        {
          ok: typeof values.kabeltype === 'string' && values.kabeltype.trim() !== '' ? true : undefined,
          text: 'Kabeltype vastgelegd',
        },
      ];
      if (d === undefined || fab === undefined) {
        return combine([...parts, { ok: undefined, text: 'Fabrikantwaarde en buitendiameter invullen' }]);
      }
      const factor = Math.max(fab, p.factorNetbeheerder);
      const bron = p.factorNetbeheerder > fab ? 'netbeheerder' : 'fabrikant';
      return combine([...parts, minCheck(num(values, 'straal'), factor * d, `Buigstraal (${fmt(factor)} × ${fmt(d)} mm, ${bron})`, 'mm')]);
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
    id: 'kabelgegevens',
    title: 'Kabel- en haspelgegevens',
    category: 'elektro',
    description: 'Herleidbaarheid van de gelegde kabel: type, fabrikant, haspel en gelegde lengte.',
    reference: 'Netbeheerderspecificatie / revisie',
    inputs: [
      { kind: 'text', key: 'kabeltype', label: 'Kabeltype', hint: 'bijv. 3x1x240 Al XLPE 12/20 kV' },
      { kind: 'text', key: 'fabrikant', label: 'Fabrikant' },
      { kind: 'text', key: 'haspel', label: 'Haspelnummer' },
      { kind: 'number', key: 'productiejaar', label: 'Productiejaar', unit: '' },
      { kind: 'number', key: 'lengte', label: 'Gelegde lengte', unit: 'm' },
      { kind: 'text', key: 'meterstanden', label: 'Meterstand begin – eind', hint: 'van de mantelopdruk' },
    ],
    params: [],
    minPhotos: 1,
    beforeBackfill: true,
    evaluate(values) {
      return combine([
        textCheck(values, 'kabeltype', 'Kabeltype'),
        textCheck(values, 'fabrikant', 'Fabrikant'),
        textCheck(values, 'haspel', 'Haspelnummer'),
        { ok: num(values, 'productiejaar') === undefined ? undefined : true, text: 'Productiejaar vastgelegd' },
        { ok: num(values, 'lengte') === undefined ? undefined : true, text: 'Gelegde lengte vastgelegd' },
        textCheck(values, 'meterstanden', 'Meterstanden'),
      ]);
    },
  },
  {
    id: 'mof',
    title: 'Verbindingsmof montage',
    category: 'elektro',
    description: 'Controle op de montage van een verbindingsmof volgens de montagehandleiding.',
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
      return combine([
        textCheck(values, 'mofnummer', 'Mofnummer'),
        textCheck(values, 'type', 'Type mofset'),
        textCheck(values, 'monteur', 'Monteur'),
        boolCheck(values, 'handleiding', 'Handleiding en maatvoering'),
        boolCheck(values, 'persing', 'Persverbindingen'),
        boolCheck(values, 'krimp', 'Krimp zonder luchtinsluitingen'),
        boolCheck(values, 'scherm', 'Aardscherm doorverbonden'),
        boolCheck(values, 'mofput', 'Mofput en ondersteuning'),
      ]);
    },
  },
  {
    id: 'eindsluiting',
    title: 'Eindsluiting montage',
    category: 'elektro',
    description: 'Controle op de montage van een binnen- of buiteneindsluiting volgens de montagehandleiding.',
    reference: 'Montagehandleiding fabrikant / NEN 3840',
    inputs: [
      { kind: 'text', key: 'positie', label: 'Station / veld / fase', hint: 'bijv. RS 12 veld 3' },
      { kind: 'text', key: 'type', label: 'Type eindsluiting en batchnummer' },
      { kind: 'text', key: 'monteur', label: 'Monteur (gekwalificeerd)' },
      { kind: 'boolean', key: 'handleiding', label: 'Montagehandleiding gevolgd, maatvoering afstrippen gecontroleerd' },
      { kind: 'boolean', key: 'kabelschoen', label: 'Kabelschoenen geperst met juiste matrijs' },
      { kind: 'boolean', key: 'veldsturing', label: 'Veldsturing/kruipweg correct aangebracht, zonder beschadiging' },
      { kind: 'boolean', key: 'scherm', label: 'Aardscherm aangesloten op aardrail' },
      { kind: 'boolean', key: 'fasen', label: 'Fasevolgorde en markering gecontroleerd' },
      { kind: 'boolean', key: 'aanhaalmoment', label: 'Aansluitingen aangehaald met voorgeschreven moment' },
    ],
    params: [],
    minPhotos: 2,
    beforeBackfill: false,
    evaluate(values) {
      return combine([
        textCheck(values, 'positie', 'Positie'),
        textCheck(values, 'type', 'Type eindsluiting'),
        textCheck(values, 'monteur', 'Monteur'),
        boolCheck(values, 'handleiding', 'Handleiding en maatvoering'),
        boolCheck(values, 'kabelschoen', 'Kabelschoenen geperst'),
        boolCheck(values, 'veldsturing', 'Veldsturing/kruipweg'),
        boolCheck(values, 'scherm', 'Aardscherm aangesloten'),
        boolCheck(values, 'fasen', 'Fasevolgorde en markering'),
        boolCheck(values, 'aanhaalmoment', 'Aanhaalmoment'),
      ]);
    },
  },
  {
    id: 'aarding',
    title: 'Aarding',
    category: 'elektro',
    description: 'Aansluiting van de kabelschermen en meting van de aardverspreidingsweerstand.',
    reference: 'Netbeheerderspecificatie / NEN 1041 / NEN-EN 50522',
    inputs: [
      { kind: 'text', key: 'locatie', label: 'Aardpunt / station' },
      { kind: 'number', key: 'weerstand', label: 'Gemeten aardverspreidingsweerstand', unit: 'Ω' },
      { kind: 'text', key: 'meetmethode', label: 'Meetmethode en instrument' },
      { kind: 'boolean', key: 'schermen', label: 'Kabelschermen aan beide zijden geaard (of volgens schermsysteem)' },
    ],
    params: [{ key: 'maxWeerstand', label: 'Max. aardverspreidingsweerstand', unit: 'Ω', default: 3 }],
    minPhotos: 1,
    beforeBackfill: false,
    evaluate(values, p) {
      const r = num(values, 'weerstand');
      return combine([
        textCheck(values, 'locatie', 'Aardpunt'),
        {
          ok: r === undefined ? undefined : r <= p.maxWeerstand,
          text: r === undefined ? `Weerstand: nog niet ingevuld (eis ≤ ${fmt(p.maxWeerstand)} Ω)` : `Weerstand: ${fmt(r)} Ω (eis ≤ ${fmt(p.maxWeerstand)} Ω)`,
        },
        textCheck(values, 'meetmethode', 'Meetmethode'),
        boolCheck(values, 'schermen', 'Schermaarding'),
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

export const DEFAULT_REQUIRED_CHECKS = ['dekking', 'zandomhulling', 'markering', 'inmeting', 'kabelgegevens', 'buigstraal', 'mantelproef'];

/** Normsets per netbeheerder. Liander = de standaardwaarden hierboven, nog te verifiëren. */
export const NORM_SETS = [{ id: 'Liander', label: 'Liander', verified: false }];
export const DEFAULT_GRID_OPERATOR = 'Liander';

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
