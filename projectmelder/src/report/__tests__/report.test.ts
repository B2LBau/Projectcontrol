import { Item, Member, Project } from '../../domain/types';
import { listReport, meetingReport, toCsv } from '../model';
import { reportDocx, reportHtml } from '../render';

const project: Project = { id: 'p', code: 'PRJ1', name: 'Kabeltracé Noord', client: 'Netbeheerder', location: 'Noord', created_at: '' };
const members: Member[] = [
  { project_id: 'p', user_id: 'u1', role: 'projectleider', organisation_id: 'o1', full_name: 'Petra Leider', phone: '31611111111', organisation_name: 'Eigen BV', organisation_kind: 'eigen' },
  { project_id: 'p', user_id: 'u2', role: 'oa_voorman', organisation_id: 'o2', full_name: 'Vincent Voorman', phone: '31633333333', organisation_name: 'De Vries Infra', organisation_kind: 'onderaannemer' },
];

function item(over: Partial<Item>): Item {
  return {
    id: 'i', project_id: 'p', number: 'PRJ1-A-001', type: 'actie', title: 'Titel', description: null, transcript: null,
    status: 'nieuw', severity: 'normaal', owner_id: 'u2', owner_org_id: 'o2', due_at: '2026-10-20T15:00:00Z',
    original_due_at: null, location_label: 'mofput 12', lat: 52.1, lng: 5.1, accuracy: 4, captured_at: '2026-10-19T08:00:00Z',
    created_by: 'u1', creator_org_id: 'o1', created_at: '2026-10-19T08:00:05Z', updated_at: '', closed_at: null,
    visibility: 'project', labels: [], meeting_id: null, source_message_id: null, parent_item_id: null, details: {},
    withdrawn_reason: null, ...over,
  };
}

const items = [
  item({ id: '2', number: 'PRJ1-B-002', type: 'besluit', title: 'Weekendwerk toegestaan', status: 'vastgesteld', closed_at: '2026-10-19T09:00:00Z', due_at: null }),
  item({ id: '1', title: 'Verkeersbesluit aanvragen; "spoed"' }),
];

describe('rapporten', () => {
  const now = new Date('2026-10-21T10:00:00Z');

  it('maakt een lijst met te-laat-markering en eigenaar inclusief bedrijf', () => {
    const r = listReport('Actielijst', project, items, members, now);
    expect(r.tables[0].rows[0][0]).toBe('PRJ1-A-001');
    expect(r.tables[0].rows[0][3]).toBe('Vincent Voorman (De Vries Infra)');
    expect(r.tables[0].rows[0][4]).toContain('te laat');
    expect(r.meta.find(([k]) => k === 'Te laat')?.[1]).toBe('1');
  });

  it('scheidt besluiten en acties in het overlegverslag', () => {
    const r = meetingReport(project, { id: 'm', project_id: 'p', title: 'Bouwoverleg 43', kind: 'bouwoverleg', starts_at: '2026-10-19T08:00:00Z', location: null, attendees: [], closed_at: null }, items, [], members, now);
    expect(r.tables[0].rows.map((x) => x[0])).toEqual(['PRJ1-B-002']);
    expect(r.tables[1].rows.map((x) => x[0])).toEqual(['PRJ1-A-001']);
  });

  it('exporteert naar CSV, HTML en Word', async () => {
    const r = listReport('Logboek', project, items, members, now);
    const csv = toCsv(r);
    expect(csv.startsWith('﻿Nr;Type')).toBe(true);
    expect(csv).toContain('"Verkeersbesluit aanvragen; ""spoed"""');
    expect(reportHtml(r)).toContain('Kabeltracé Noord');
    const docx = await reportDocx(r);
    expect(docx[0]).toBe(0x50); // 'PK' zip-header
    expect(docx[1]).toBe(0x4b);
  });
});
