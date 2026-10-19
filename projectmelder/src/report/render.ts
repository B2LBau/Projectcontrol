import './buffer';

import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  PageOrientation,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import type { Report } from './model';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function reportHtml(r: Report): string {
  const meta = r.meta
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${esc(v)}</td></tr>`)
    .join('');
  const tables = r.tables
    .map((t) => {
      const head = t.columns.map((c, i) => `<th style="width:${t.widths[i]}%">${esc(c)}</th>`).join('');
      const body = t.rows.length
        ? t.rows.map((row) => `<tr>${row.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')
        : `<tr><td colspan="${t.columns.length}" class="empty">${esc(t.empty)}</td></tr>`;
      return t.rows.length || t.empty ? `<h2>${esc(t.heading)}</h2><table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>` : '';
    })
    .join('');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><title>${esc(r.title)}</title><style>
    @page { size: A4 landscape; margin: 14mm; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #14181D; font-size: 10pt; }
    h1 { color: #0B4F9C; font-size: 18pt; margin: 0 0 2px; }
    .sub { color: #5B6570; margin-bottom: 10px; }
    h2 { color: #0B4F9C; font-size: 12pt; margin: 16px 0 6px; }
    table { border-collapse: collapse; width: 100%; }
    .meta th { text-align: left; color: #5B6570; font-weight: 600; padding: 2px 12px 2px 0; width: 120px; }
    .grid th { background: #0B4F9C; color: #fff; text-align: left; padding: 4px 6px; }
    .grid td { border-bottom: 1px solid #D3D9E0; padding: 4px 6px; vertical-align: top; }
    .grid tr:nth-child(even) td { background: #F3F5F7; }
    .empty { color: #5B6570; font-style: italic; }
    .foot { color: #5B6570; font-size: 8pt; margin-top: 16px; }
  </style></head><body>
    <h1>${esc(r.title)}</h1><div class="sub">${esc(r.subtitle)}</div>
    <table class="meta">${meta}</table>${tables}
    <div class="foot">${esc(r.footer)}</div></body></html>`;
}

// Liggend A4: tekstbreedte bij 1,5 cm marges in DXA
const WIDTH = 16838 - 2 * 850;
const border = { style: BorderStyle.SINGLE, size: 4, color: 'C8CED6' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(text: string, width: number, header = false, shade?: string) {
  return new TableCell({
    borders,
    width: { size: width, type: WidthType.DXA },
    shading: header
      ? { type: ShadingType.CLEAR, fill: '0B4F9C', color: 'auto' }
      : shade
        ? { type: ShadingType.CLEAR, fill: shade, color: 'auto' }
        : undefined,
    margins: { top: 50, bottom: 50, left: 80, right: 80 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: header, color: header ? 'FFFFFF' : undefined, size: 18 })] })],
  });
}

export async function reportDocx(r: Report): Promise<Uint8Array> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: r.title, color: '0B4F9C', bold: true, size: 36 })] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: r.subtitle, color: '5B6570' })] }),
    ...r.meta
      .filter(([, v]) => v)
      .map(([k, v]) => new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(v)] })),
  ];
  for (const t of r.tables) {
    if (!t.rows.length && !t.empty) continue;
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 }, children: [new TextRun({ text: t.heading, color: '0B4F9C' })] }),
    );
    if (!t.rows.length) {
      children.push(new Paragraph({ children: [new TextRun({ text: t.empty, italics: true, color: '5B6570' })] }));
      continue;
    }
    const total = t.widths.reduce((a, b) => a + b, 0);
    const widths = t.widths.map((w) => Math.floor((w / total) * WIDTH));
    widths[widths.length - 1] += WIDTH - widths.reduce((a, b) => a + b, 0);
    children.push(
      new Table({
        width: { size: WIDTH, type: WidthType.DXA },
        columnWidths: widths,
        rows: [
          new TableRow({ tableHeader: true, children: t.columns.map((c, i) => cell(c, widths[i], true)) }),
          ...t.rows.map((row, ri) => new TableRow({ children: row.map((c, i) => cell(c, widths[i], false, ri % 2 ? 'F3F5F7' : undefined)) })),
        ],
      }),
    );
  }
  children.push(new Paragraph({ spacing: { before: 240 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: r.footer, size: 16, color: '5B6570' })] }));

  const doc = new Document({
    creator: 'ProjectMelder',
    title: r.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [
      {
        properties: {
          page: {
            size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE },
            margin: { top: 850, bottom: 850, left: 850, right: 850 },
          },
        },
        children,
      },
    ],
  });
  const buf = await Packer.toArrayBuffer(doc);
  return new Uint8Array(buf);
}
