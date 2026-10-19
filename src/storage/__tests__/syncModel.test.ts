import type { AppData, Registration } from '../../domain/types';
import {
  allKeys,
  clearPending,
  EMPTY_SYNC,
  fromRegistrationRow,
  fromSectionRow,
  markPending,
  mergePulled,
  ProjectRow,
  syncKey,
  toProjectRow,
  toRegistrationRow,
  toSectionRow,
} from '../syncModel';

const registration: Registration = {
  id: 'r1',
  sectionId: 's1',
  checkId: 'dekking',
  values: { ligging: 'berm', dekking: 0.9 },
  params: { minBerm: 0.8 },
  evaluation: { status: 'voldoet', details: ['ok'] },
  photos: ['file:///data/fotos/123-ab.jpg'],
  location: { latitude: 52.5, longitude: 6.1, accuracy: 4 },
  recordedBy: 'K. de Groot',
  recordedAt: '2026-10-01T09:00:00.000Z',
  remark: '',
};

const data: AppData = {
  version: 1,
  settings: { userName: 'K. de Groot', company: '', role: 'werkverantwoordelijke' },
  projects: [{ id: 'p1', name: 'Project', number: '1', client: '', location: '', gridOperator: 'Liander', createdAt: '2026-10-01T08:00:00.000Z', paramOverrides: {} }],
  sections: [{ id: 's1', projectId: 'p1', name: 'Deel 1', from: '0', to: '50', requiredChecks: ['dekking'], createdAt: '2026-10-01T08:00:00.000Z' }],
  registrations: [registration],
};

const localUri = (name: string) => `file:///device/fotos/${name}`;

describe('wachtrij', () => {
  it('zet bestaande gegevens bij de eerste koppeling in de wachtrij', () => {
    expect(allKeys(data)).toEqual(['projects:p1', 'sections:s1', 'registrations:r1']);
  });

  it('haalt alleen records uit de wachtrij die tijdens het versturen niet opnieuw gewijzigd zijn', () => {
    let meta = markPending(EMPTY_SYNC, ['projects:p1', 'sections:s1']);
    const sent = { ...meta.pending };
    meta = markPending(meta, ['sections:s1']); // gewijzigd tijdens het versturen
    expect(Object.keys(clearPending(meta, sent).pending)).toEqual(['sections:s1']);
  });
});

describe('databaserijen', () => {
  it('slaat foto’s op als pad in de bucket en zet ze terug naar een lokale plek', () => {
    const row = toRegistrationRow(registration);
    expect(row.photos).toEqual(['r1/123-ab.jpg']);
    expect(row.withdrawn).toBeNull();
    const back = fromRegistrationRow(row, localUri);
    expect(back.photos).toEqual(['file:///device/fotos/123-ab.jpg']);
    expect({ ...back, photos: registration.photos }).toEqual(registration);
  });

  it('zet een tracédeel heen en terug om zonder verlies', () => {
    const section = { ...data.sections[0], release: { by: 'A', at: '2026-10-02T10:00:00.000Z' }, releaseLog: [] };
    expect(fromSectionRow(toSectionRow(section))).toEqual(section);
  });
});

describe('samenvoegen', () => {
  const remoteProject: ProjectRow = { ...toProjectRow(data.projects[0]), name: 'Nieuwe naam', updated_at: '2026-10-03T00:00:00Z' };

  it('neemt wijzigingen van de server over', () => {
    const merged = mergePulled(data, EMPTY_SYNC, { projects: [remoteProject], sections: [], registrations: [] }, localUri);
    expect(merged.projects[0].name).toBe('Nieuwe naam');
  });

  it('laat een lokale wijziging die nog verstuurd moet staan', () => {
    const meta = markPending(EMPTY_SYNC, [syncKey('projects', 'p1')]);
    const merged = mergePulled(data, meta, { projects: [remoteProject], sections: [], registrations: [] }, localUri);
    expect(merged.projects[0].name).toBe('Project');
  });

  it('voegt nieuwe records toe en verwijdert records die elders verwijderd zijn', () => {
    const newProject = { ...remoteProject, id: 'p2', name: 'Collega' };
    const deletedSection = { ...toSectionRow(data.sections[0]), deleted_at: '2026-10-03T00:00:00Z' };
    const merged = mergePulled(data, EMPTY_SYNC, { projects: [newProject], sections: [deletedSection], registrations: [] }, localUri);
    expect(merged.projects.map((p) => p.id)).toEqual(['p2', 'p1']);
    expect(merged.sections).toEqual([]);
  });
});
