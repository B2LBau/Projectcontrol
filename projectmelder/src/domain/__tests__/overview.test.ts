import { itemStats, sortItems } from '../overview';
import type { Item } from '../types';

function item(over: Partial<Item>): Item {
  return {
    id: over.number ?? 'x', project_id: 'p1', number: 'P1-A-001', type: 'actie', title: 'T', description: null, transcript: null,
    status: 'nieuw', severity: 'normaal', owner_id: null, owner_org_id: null, due_at: null, original_due_at: null,
    location_label: null, lat: null, lng: null, accuracy: null, captured_at: null, created_by: 'u', creator_org_id: null,
    created_at: '2026-10-19T08:00:00Z', updated_at: '', closed_at: null, visibility: 'project', labels: [], meeting_id: null,
    source_message_id: null, parent_item_id: null, details: {}, withdrawn_reason: null, ...over,
  };
}

const ctx = {
  ownerName: (id: string | null) => ({ a: 'Anna', b: 'Bert' })[id as 'a' | 'b'] ?? '',
  projectCode: (id: string) => ({ p1: 'P2611', p2: 'P2502' })[id as 'p1' | 'p2'] ?? '',
};

const items = [
  item({ number: 'P1-A-010', due_at: '2026-10-25T15:00:00Z', owner_id: 'b', severity: 'hoog' }),
  item({ number: 'P1-A-002', due_at: null, owner_id: null }),
  item({ number: 'P1-A-009', due_at: '2026-10-20T15:00:00Z', owner_id: 'a', project_id: 'p2', status: 'gereed_gemeld' }),
];

describe('overzicht', () => {
  it('sorteert op termijn met lege termijnen achteraan, in beide richtingen', () => {
    expect(sortItems(items, 'due', 'asc', ctx).map((i) => i.number)).toEqual(['P1-A-009', 'P1-A-010', 'P1-A-002']);
    expect(sortItems(items, 'due', 'desc', ctx).map((i) => i.number)).toEqual(['P1-A-010', 'P1-A-009', 'P1-A-002']);
  });

  it('sorteert nummers numeriek en op project, eigenaar, status en ernst', () => {
    expect(sortItems(items, 'number', 'asc', ctx).map((i) => i.number)).toEqual(['P1-A-002', 'P1-A-009', 'P1-A-010']);
    expect(sortItems(items, 'project', 'asc', ctx)[0].project_id).toBe('p2');
    expect(sortItems(items, 'owner', 'asc', ctx).map((i) => i.owner_id)).toEqual(['a', 'b', null]);
    expect(sortItems(items, 'status', 'desc', ctx)[0].status).toBe('gereed_gemeld');
    expect(sortItems(items, 'severity', 'desc', ctx)[0].severity).toBe('hoog');
    expect(items[0].number).toBe('P1-A-010'); // origineel ongewijzigd
  });

  it('telt open, te laat, vandaag en urgent', () => {
    const now = new Date('2026-10-20T10:00:00Z');
    const list = [
      ...items,
      item({ number: 'P1-B-003', type: 'besluit', status: 'vastgesteld', severity: 'kritiek' }),
      item({ number: 'P1-A-004', due_at: '2026-10-19T15:00:00Z' }),
    ];
    expect(itemStats(list, now)).toEqual({ open: 4, overdue: 1, dueToday: 1, urgent: 1 });
  });
});
