import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { Report, toCsv } from './model';
import { reportDocx, reportHtml } from './render';

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  csv: 'text/csv',
};
const UTI = { pdf: 'com.adobe.pdf', docx: 'org.openxmlformats.wordprocessingml.document', csv: 'public.comma-separated-values-text' };

export type Format = keyof typeof MIME;

function fileName(r: Report, ext: Format): string {
  const base = `${r.title} ${r.subtitle}`.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_');
  return `${base}_${new Date().toISOString().slice(0, 10)}.${ext}`;
}

function downloadWeb(data: BlobPart, name: string, mime: string) {
  const url = URL.createObjectURL(new Blob([data], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function share(target: File, ext: Format) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Delen is op dit apparaat niet beschikbaar.');
  await Sharing.shareAsync(target.uri, { mimeType: MIME[ext], UTI: UTI[ext], dialogTitle: 'Rapport delen' });
}

function writeTarget(name: string, data: Uint8Array | string): File {
  const target = new File(Paths.cache, name);
  if (target.exists) target.delete();
  target.create();
  target.write(data);
  return target;
}

export async function exportReport(r: Report, ext: Format) {
  const name = fileName(r, ext);
  if (ext === 'pdf') {
    const html = reportHtml(r);
    if (Platform.OS === 'web') {
      await Print.printAsync({ html }); // browser: afdrukken / opslaan als PDF
      return;
    }
    const { uri } = await Print.printToFileAsync({ html, width: 842, height: 595 });
    const target = new File(Paths.cache, name);
    if (target.exists) target.delete();
    new File(uri).move(target);
    await share(target, ext);
    return;
  }
  const data = ext === 'docx' ? await reportDocx(r) : toCsv(r);
  if (Platform.OS === 'web') {
    downloadWeb(data as BlobPart, name, MIME[ext]);
    return;
  }
  await share(writeTarget(name, data), ext);
}
