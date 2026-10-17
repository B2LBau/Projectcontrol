import { readPhotoBase64 } from '../services/photos';
import type { Report } from './model';

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** HTML voor expo-print; foto's worden als data-URI ingesloten zodat de PDF op zichzelf staat. */
export async function reportHtml(report: Report): Promise<string> {
  const p = report.project;
  const sections: string[] = [];
  for (const s of report.sections) {
    const rows: string[] = [];
    for (const r of s.rows) {
      const photos: string[] = [];
      for (const uri of r.photos) {
        const b64 = await readPhotoBase64(uri);
        if (b64) photos.push(`<img src="data:image/jpeg;base64,${b64}" />`);
      }
      rows.push(`
        <tr>
          <td><b>${esc(r.check)}</b></td>
          <td class="${r.ok ? 'ok' : 'nok'}">${esc(r.status)}</td>
          <td>${r.details.map(esc).join('<br/>')}${r.remark ? `<br/><i>${esc(r.remark)}</i>` : ''}</td>
          <td>${esc(r.recordedBy)}<br/>${esc(r.recordedAt)}<br/><span class="small">${esc(r.position)}</span></td>
        </tr>
        ${photos.length ? `<tr><td colspan="4" class="photos">${photos.join('')}</td></tr>` : ''}`);
    }
    sections.push(`
      <h2>${esc(s.name)}${s.range ? ` <span class="small">(${esc(s.range)})</span>` : ''}</h2>
      <p>${esc(s.summary)}<br/><b>${esc(s.release)}</b></p>
      <table>
        <thead><tr><th>Eis</th><th>Status</th><th>Toetsing</th><th>Vastgelegd</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      ${
        s.history.length
          ? `<h3>Historie van alle registraties</h3>
      <table>
        <thead><tr><th>Tijdstip</th><th>Eis</th><th>Toetsing</th><th>Status registratie</th><th>Door</th><th>Toelichting</th></tr></thead>
        <tbody>${s.history
          .map(
            (h) =>
              `<tr><td>${esc(h.recordedAt)}</td><td>${esc(h.check)}</td><td>${esc(h.result)}</td><td>${esc(h.state)}</td><td>${esc(h.recordedBy)}</td><td>${esc(h.note)}</td></tr>`,
          )
          .join('')}</tbody>
      </table>`
          : ''
      }
      ${s.releaseLog.length ? `<h3>Vrijgavehistorie</h3><p>${s.releaseLog.map(esc).join('<br/>')}</p>` : ''}`);
  }
  return `<!doctype html>
<html lang="nl"><head><meta charset="utf-8"/>
<style>
  @page { margin: 16mm; }
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; font-size: 10pt; color: #1b1f24; }
  h1 { font-size: 16pt; margin: 0 0 4pt; }
  h3 { font-size: 10.5pt; margin: 10pt 0 4pt; }
  h2 { font-size: 12pt; margin: 16pt 0 4pt; border-bottom: 1px solid #c8ced6; padding-bottom: 2pt; }
  table { width: 100%; border-collapse: collapse; page-break-inside: auto; }
  tr { page-break-inside: avoid; }
  th, td { border: 1px solid #c8ced6; padding: 4pt; vertical-align: top; text-align: left; }
  th { background: #eef1f4; }
  .ok { color: #1a7f37; font-weight: bold; }
  .nok { color: #b42318; font-weight: bold; }
  .small { color: #57606a; font-size: 8pt; }
  .photos img { height: 120pt; margin: 2pt; border: 1px solid #c8ced6; }
  .meta td { border: none; padding: 1pt 8pt 1pt 0; }
</style></head>
<body>
  <h1>${esc(report.title)}</h1>
  <table class="meta">
    <tr><td>Projectnummer</td><td>${esc(p.number)}</td></tr>
    <tr><td>Opdrachtgever</td><td>${esc(p.client)}</td></tr>
    <tr><td>Locatie</td><td>${esc(p.location)}</td></tr>
    <tr><td>Normset</td><td>${esc(p.gridOperator)} (uitgangspunt, te verifiëren met de specificatie van de netbeheerder)</td></tr>
    <tr><td>Opgesteld</td><td>${esc(report.generatedAt)}${report.generatedBy ? ` door ${esc(report.generatedBy)}` : ''}</td></tr>
  </table>
  ${sections.join('') || '<p>Nog geen tracédelen vastgelegd.</p>'}
</body></html>`;
}
