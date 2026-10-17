import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { AppData } from '../domain/types';
import { reportDocx } from './docx';
import { reportHtml } from './html';
import { buildReport } from './model';

function fileName(data: AppData, projectId: string, ext: string): string {
  const project = data.projects.find((p) => p.id === projectId);
  const base = `Bewijsdossier ${project?.number || ''} ${project?.name || ''}`.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_');
  const date = new Date().toISOString().slice(0, 10);
  return `${base}_${date}.${ext}`;
}

async function share(uri: string, mimeType: string, UTI: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Delen is op dit apparaat niet beschikbaar.');
  await Sharing.shareAsync(uri, { mimeType, UTI, dialogTitle: 'Bewijsdossier delen' });
}

export async function exportPdf(data: AppData, projectId: string) {
  const html = await reportHtml(buildReport(data, projectId));
  // A4 bij 72 ppi
  const { uri } = await Print.printToFileAsync({ html, width: 595, height: 842 });
  const target = new File(Paths.cache, fileName(data, projectId, 'pdf'));
  if (target.exists) target.delete();
  await new File(uri).move(target);
  await share(target.uri, 'application/pdf', 'com.adobe.pdf');
}

export async function exportDocx(data: AppData, projectId: string) {
  const bytes = await reportDocx(buildReport(data, projectId));
  const target = new File(Paths.cache, fileName(data, projectId, 'docx'));
  if (target.exists) target.delete();
  target.create();
  await target.write(bytes);
  await share(target.uri, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'org.openxmlformats.wordprocessingml.document');
}
