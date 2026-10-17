import { reportDocx, jpegSize } from '../docx';
import { reportHtml } from '../html';
import { buildReport } from '../model';
import type { AppData } from '../../domain/types';

// SOI, APP0 (lengte 4), SOF0 met hoogte 3 en breedte 4
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x03, 0x00, 0x04, 0x03, 0, 0, 0];

jest.mock('../../services/photos', () => ({
  readPhotoBase64: async () => 'AAAA',
  readPhotoBytes: async () => new Uint8Array(JPEG),
}));

const data: AppData = {
  version: 1,
  settings: { userName: 'K. de Groot', company: 'Projectbeheerst', role: 'werkverantwoordelijke' },
  projects: [{ id: 'p1', name: 'OS Noord – RS 12', number: '2026-014', client: 'Netbeheerder', location: 'Zwolle', gridOperator: 'Liander', createdAt: '2026-10-01T08:00:00.000Z', paramOverrides: {} }],
  sections: [
    { id: 's1', projectId: 'p1', name: 'Tracédeel 1', from: '0+000', to: '0+050', requiredChecks: ['dekking', 'mantelproef'], createdAt: '2026-10-01T08:00:00.000Z' },
  ],
  registrations: [
    {
      id: 'r1',
      sectionId: 's1',
      checkId: 'dekking',
      values: { ligging: 'berm', dekking: 0.9 },
      params: { minBerm: 0.8 },
      evaluation: { status: 'voldoet', details: ['✓ Dekking: 0,9 m (eis ≥ 0,8 m)'] },
      photos: ['file:///foto.jpg'],
      location: { latitude: 52.5, longitude: 6.1, accuracy: 4 },
      recordedBy: 'K. de Groot',
      recordedAt: '2026-10-02T09:30:00.000Z',
      remark: '<test>',
    },
    {
      id: 'r0',
      sectionId: 's1',
      checkId: 'dekking',
      values: { ligging: 'berm', dekking: 0.6 },
      params: { minBerm: 0.8 },
      evaluation: { status: 'voldoet_niet', details: ['✗ Dekking: 0,6 m (eis ≥ 0,8 m)'] },
      photos: [],
      location: null,
      recordedBy: 'K. de Groot',
      recordedAt: '2026-10-02T08:00:00.000Z',
      remark: '',
      withdrawn: { by: 'K. de Groot (Werkverantwoordelijke)', at: '2026-10-02T08:10:00.000Z', reason: 'Meting in verkeerd tracédeel' },
    },
  ],
};

describe('bewijsdossier', () => {
  it('neemt per eis de status op, ook als die nog ontbreekt', () => {
    const report = buildReport(data, 'p1');
    expect(report.sections[0].rows.map((r) => r.status)).toEqual(['Voldoet', 'Nog aantonen']);
    expect(report.sections[0].release).toBe('Nog niet vrijgegeven voor aanvullen');
  });

  it('toont ook ingetrokken registraties met reden in de historie', () => {
    const history = buildReport(data, 'p1').sections[0].history;
    expect(history.map((h) => h.state)).toEqual(['Ingetrokken', 'Actueel']);
    expect(history[0].note).toContain('Meting in verkeerd tracédeel');
  });

  it('escapet gebruikersinvoer in de HTML', async () => {
    const html = await reportHtml(buildReport(data, 'p1'));
    expect(html).toContain('&lt;test&gt;');
    expect(html).not.toContain('<test>');
    expect(html).toContain('data:image/jpeg;base64,AAAA');
  });

  it('maakt een geldig .docx-bestand, ook zonder Node Buffer (React Native)', async () => {
    const buffer = (globalThis as { Buffer?: unknown }).Buffer;
    delete (globalThis as { Buffer?: unknown }).Buffer;
    try {
      const bytes = await reportDocx(buildReport(data, 'p1'));
      expect(bytes[0]).toBe(0x50); // 'PK' zip-header
      expect(bytes[1]).toBe(0x4b);
      expect(bytes.length).toBeGreaterThan(1000);
    } finally {
      (globalThis as { Buffer?: unknown }).Buffer = buffer;
    }
  });

  it('leest de afmetingen uit een JPEG-header', () => {
    expect(jpegSize(new Uint8Array(JPEG))).toEqual({ width: 4, height: 3 });
  });
});
