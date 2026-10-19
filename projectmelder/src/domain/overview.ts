// Overzicht over alle projecten (FO §5.12): sorteren en kerncijfers voor de lijst/tabel.
import { isClosed, STATUSES } from './status';
import { Item, SEVERITIES } from './types';

export type SortKey = 'number' | 'project' | 'type' | 'title' | 'owner' | 'due' | 'status' | 'severity' | 'created';
export type SortDir = 'asc' | 'desc';

export type SortContext = {
  ownerName: (id: string | null) => string;
  projectCode: (id: string) => string;
};

function statusRank(i: Item): number {
  if (i.status === 'ingetrokken') return 99;
  return STATUSES[i.type].findIndex((s) => s.key === i.status);
}

/** Sorteert zonder het origineel te wijzigen. Lege termijnen en eigenaren komen altijd achteraan. */
export function sortItems(items: Item[], key: SortKey, dir: SortDir, ctx: SortContext): Item[] {
  const f = dir === 'asc' ? 1 : -1;
  const cmpText = (a: string, b: string) => a.localeCompare(b, 'nl', { numeric: true, sensitivity: 'base' });
  const value = (i: Item): string | number | null => {
    switch (key) {
      case 'number':
        return i.number;
      case 'project':
        return ctx.projectCode(i.project_id);
      case 'type':
        return i.type;
      case 'title':
        return i.title;
      case 'owner':
        return i.owner_id ? ctx.ownerName(i.owner_id) : null;
      case 'due':
        return i.due_at ? Date.parse(i.due_at) : null;
      case 'status':
        return statusRank(i);
      case 'severity':
        return SEVERITIES.indexOf(i.severity);
      case 'created':
        return Date.parse(i.captured_at ?? i.created_at);
    }
  };
  return [...items].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va === null && vb === null) return cmpText(a.number, b.number);
    if (va === null) return 1;
    if (vb === null) return -1;
    const c = typeof va === 'number' && typeof vb === 'number' ? va - vb : cmpText(String(va), String(vb));
    return c !== 0 ? c * f : cmpText(a.number, b.number);
  });
}

export type Stats = { open: number; overdue: number; dueToday: number; urgent: number };

/** Kerncijfers: open, te laat, vandaag af, open met ernst hoog/kritiek. */
export function itemStats(items: Item[], now: Date): Stats {
  const today = now.toDateString();
  const open = items.filter((i) => !isClosed(i.type, i.status));
  return {
    open: open.length,
    overdue: open.filter((i) => i.due_at && Date.parse(i.due_at) < now.getTime()).length,
    dueToday: open.filter((i) => i.due_at && Date.parse(i.due_at) >= now.getTime() && new Date(i.due_at).toDateString() === today).length,
    urgent: open.filter((i) => i.severity === 'hoog' || i.severity === 'kritiek').length,
  };
}
