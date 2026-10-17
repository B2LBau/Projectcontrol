import { ensureBuffer } from './buffer';
import {
  BorderStyle,
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

import { readPhotoBytes } from '../services/photos';
import type { Report } from './model';

/** Leest breedte en hoogte uit de SOF-marker van een JPEG, zodat foto's niet vervormen. */
export function jpegSize(bytes: Uint8Array): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    const length = (bytes[i + 2] << 8) | bytes[i + 3];
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { height: (bytes[i + 5] << 8) | bytes[i + 6], width: (bytes[i + 7] << 8) | bytes[i + 8] };
    }
    i += 2 + length;
  }
  return null;
}

const border = { style: BorderStyle.SINGLE, size: 4, color: 'C8CED6' };
const borders = { top: border, bottom: border, left: border, right: border };

function cell(lines: string[], opts: { bold?: boolean; color?: string; header?: boolean; width: number }) {
  return new TableCell({
    borders,
    width: { size: opts.width, type: WidthType.PERCENTAGE },
    shading: opts.header ? { type: ShadingType.CLEAR, fill: 'EEF1F4', color: 'auto' } : undefined,
    children: (lines.length ? lines : ['']).map(
      (line) => new Paragraph({ children: [new TextRun({ text: line, bold: opts.bold || opts.header, color: opts.color, size: 18 })] }),
    ),
  });
}

const WIDTHS = [22, 14, 40, 24];

export async function reportDocx(report: Report): Promise<Uint8Array> {
  ensureBuffer();
  const p = report.project;
  const children: (Paragraph | Table)[] = [
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(report.title)] }),
    ...[
      ['Projectnummer', p.number],
      ['Opdrachtgever', p.client],
      ['Locatie', p.location],
      ['Opgesteld', `${report.generatedAt}${report.generatedBy ? ` door ${report.generatedBy}` : ''}`],
    ].map(([k, v]) => new Paragraph({ children: [new TextRun({ text: `${k}: `, bold: true }), new TextRun(v)] })),
  ];

  if (report.sections.length === 0) children.push(new Paragraph('Nog geen tracédelen vastgelegd.'));

  for (const s of report.sections) {
    children.push(
      new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(`${s.name}${s.range ? ` (${s.range})` : ''}`)] }),
      new Paragraph(s.summary),
      new Paragraph({ children: [new TextRun({ text: s.release, bold: true })] }),
    );
    const rows = [
      new TableRow({
        tableHeader: true,
        children: ['Eis', 'Status', 'Toetsing', 'Vastgelegd'].map((h, i) => cell([h], { header: true, width: WIDTHS[i] })),
      }),
    ];
    for (const r of s.rows) {
      rows.push(
        new TableRow({
          cantSplit: true,
          children: [
            cell([r.check], { bold: true, width: WIDTHS[0] }),
            cell([r.status], { bold: true, color: r.ok ? '1A7F37' : 'B42318', width: WIDTHS[1] }),
            cell([...r.details, ...(r.remark ? [`Opmerking: ${r.remark}`] : [])], { width: WIDTHS[2] }),
            cell([r.recordedBy, r.recordedAt, r.position].filter(Boolean), { width: WIDTHS[3] }),
          ],
        }),
      );
    }
    children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));

    const images: (ImageRun | TextRun)[] = [];
    for (const r of s.rows) {
      for (const uri of r.photos) {
        const bytes = await readPhotoBytes(uri);
        if (!bytes) continue;
        const size = jpegSize(bytes) ?? { width: 4, height: 3 };
        const height = 160;
        images.push(
          new ImageRun({
            type: 'jpg',
            data: bytes,
            transformation: { width: Math.round((height * size.width) / size.height), height },
            altText: { name: r.check, description: `${r.check} – ${r.recordedAt}`, title: r.check },
          }),
        );
        images.push(new TextRun('  '));
      }
    }
    if (images.length) {
      children.push(new Paragraph({ spacing: { before: 120 }, children: [new TextRun({ text: "Foto's", bold: true })] }));
      children.push(new Paragraph({ children: images }));
    }
  }

  const doc = new Document({
    creator: report.generatedBy || 'Kabelcontrole 20 kV',
    title: report.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 20 } } } },
    sections: [{ children }],
  });
  return new Uint8Array(await Packer.toArrayBuffer(doc));
}
