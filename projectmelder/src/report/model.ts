// Rapportmodel voor exports (lijst, actielijst, besluitenlijst, overlegverslag).
import { bucketFor } from '../domain/deadlines';
import { statusLabel } from '../domain/status';
import { Item, ITEM_TYPE_INFO, Meeting, Member, Project, SEVERITY_LABELS } from '../domain/types';

export type Table = { heading: string; columns: string[]; widths: number[]; rows: string[][]; empty: string };

export type Report = {
  title: string;
  subtitle: string;
  meta: [string, string][];
  tables: Table[];
  footer: string;
};

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

function name(members: Member[], id: string | null) {
  if (!id) return '';
  const m = members.find((x) => x.user_id === id);
  if (!m) return 'Onbekend';
  return m.organisation_kind === 'eigen' || !m.organisation_name ? m.full_name : `${m.full_name} (${m.organisation_name})`;
}

function itemRow(i: Item, members: Member[], now: Date): string[] {
  const late = !i.closed_at && bucketFor(i.due_at ? new Date(i.due_at) : null, now) === 'te_laat';
  return [
    i.number,
    ITEM_TYPE_INFO[i.type].label,
    [i.title, i.description && i.description !== i.title ? i.description : ''].filter(Boolean).join(' – '),
    name(members, i.owner_id),
    fmtDate(i.due_at) + (late ? ' (te laat)' : ''),
    statusLabel(i.type, i.status),
  ];
}

const ITEM_COLS = ['Nr', 'Type', 'Omschrijving', 'Eigenaar', 'Termijn', 'Status'];
const ITEM_WIDTHS = [11, 11, 40, 16, 11, 11];

export function listReport(title: string, project: Project, items: Item[], members: Member[], now = new Date()): Report {
  const sorted = [...items].sort((a, b) => a.number.localeCompare(b.number, 'nl', { numeric: true }));
  return {
    title,
    subtitle: `${project.code} – ${project.name}`,
    meta: [
      ['Opdrachtgever', project.client ?? ''],
      ['Locatie', project.location ?? ''],
      ['Aantal', String(items.length)],
      ['Open', String(items.filter((i) => !i.closed_at).length)],
      ['Te laat', String(items.filter((i) => !i.closed_at && i.due_at && new Date(i.due_at) < now).length)],
    ],
    tables: [
      {
        heading: 'Overzicht',
        columns: ITEM_COLS,
        widths: ITEM_WIDTHS,
        rows: sorted.map((i) => itemRow(i, members, now)),
        empty: 'Geen meldingen.',
      },
      {
        heading: 'Vastlegging',
        columns: ['Nr', 'Gemeld door', 'Gemeld op', 'Locatie', 'Ernst'],
        widths: [12, 22, 18, 36, 12],
        rows: sorted.map((i) => [
          i.number,
          name(members, i.created_by),
          fmtDateTime(i.captured_at ?? i.created_at),
          [i.location_label, i.lat != null && i.lng != null ? `${i.lat.toFixed(5)}, ${i.lng.toFixed(5)}` : '']
            .filter(Boolean)
            .join(' · '),
          SEVERITY_LABELS[i.severity],
        ]),
        empty: '',
      },
    ],
    footer: `Gegenereerd met ProjectMelder op ${fmtDateTime(now.toISOString())}`,
  };
}

export function meetingReport(
  project: Project,
  meeting: Meeting,
  items: Item[],
  openFromBefore: Item[],
  members: Member[],
  now = new Date(),
): Report {
  const decisions = items.filter((i) => i.type === 'besluit');
  const actions = items.filter((i) => i.type !== 'besluit');
  return {
    title: `Verslag ${meeting.title}`,
    subtitle: `${project.code} – ${project.name}`,
    meta: [
      ['Soort overleg', meeting.kind],
      ['Datum', fmtDateTime(meeting.starts_at)],
      ['Locatie', meeting.location ?? ''],
      ['Status', meeting.closed_at ? `Afgerond ${fmtDateTime(meeting.closed_at)}` : 'Concept'],
    ],
    tables: [
      {
        heading: 'Besluiten',
        columns: ['Nr', 'Besluit', 'Vastgelegd door', 'Status'],
        widths: [12, 56, 18, 14],
        rows: decisions.map((i) => [
          i.number,
          [i.title, i.description && i.description !== i.title ? i.description : ''].filter(Boolean).join(' – '),
          name(members, i.created_by),
          statusLabel(i.type, i.status),
        ]),
        empty: 'Geen besluiten.',
      },
      {
        heading: 'Nieuwe acties en meldingen',
        columns: ITEM_COLS,
        widths: ITEM_WIDTHS,
        rows: actions.map((i) => itemRow(i, members, now)),
        empty: 'Geen nieuwe acties.',
      },
      {
        heading: 'Openstaande acties uit eerdere overleggen',
        columns: ITEM_COLS,
        widths: ITEM_WIDTHS,
        rows: openFromBefore.map((i) => itemRow(i, members, now)),
        empty: 'Geen openstaande acties.',
      },
    ],
    footer: `Gegenereerd met ProjectMelder op ${fmtDateTime(now.toISOString())}`,
  };
}

/** CSV met puntkomma (opent direct goed in Nederlandse Excel). */
export function toCsv(r: Report): string {
  const t = r.tables[0];
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return '﻿' + [t.columns, ...t.rows].map((row) => row.map(esc).join(';')).join('\r\n');
}
