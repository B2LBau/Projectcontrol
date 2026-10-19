import type { AppData } from '../domain/types';
import { downloadPhoto, photoExists, readPhotoBytes } from '../services/photos';
import { PHOTO_BUCKET, supabase } from '../services/supabase';
import {
  photoPath,
  Pulled,
  splitKey,
  SyncMeta,
  Table,
  TABLES,
  toProjectRow,
  toRegistrationRow,
  toSectionRow,
} from './syncModel';

export type SyncResult = {
  /** Verstuurde records met het volgnummer dat verstuurd is. */
  sent: Record<string, number>;
  pulled: Pulled;
  cursor: string | null;
  /** Meldingen over records die de server weigerde. */
  errors: string[];
};

type DbError = { message: string; code?: string };

/** Fouten met een Postgres-foutcode komen van de database zelf; zonder code is het een verbindingsfout. */
function isDatabaseError(e: DbError): boolean {
  return /^[0-9A-Z]{5}$/.test(e.code ?? '');
}

/** Bewijsregel geschonden (trigger): de versie op de server gaat voor. */
function isRuleViolation(e: DbError): boolean {
  return e.code === 'P0001';
}

const PAGE = 1000;
// Overlap bij het ophalen, zodat wijzigingen die net rond de vorige synchronisatie vielen niet gemist worden.
const OVERLAP_MS = 5 * 60 * 1000;

function client() {
  if (!supabase) throw new Error('Supabase is niet ingesteld.');
  return supabase;
}

async function uploadPhotos(registrationId: string, uris: string[]) {
  const bucket = client().storage.from(PHOTO_BUCKET);
  for (const uri of uris) {
    const bytes = await readPhotoBytes(uri);
    if (!bytes) continue; // foto niet meer op dit toestel
    const { error } = await bucket.upload(photoPath(registrationId, uri), bytes, { contentType: 'image/jpeg', upsert: false });
    if (error && error.statusCode !== '409' && !/exists/i.test(error.message)) throw error;
  }
}

function rowsFor(table: Table, data: AppData, ids: string[]) {
  const wanted = new Set(ids);
  if (table === 'projects') return data.projects.filter((p) => wanted.has(p.id)).map(toProjectRow);
  if (table === 'sections') return data.sections.filter((s) => wanted.has(s.id)).map(toSectionRow);
  return data.registrations.filter((r) => wanted.has(r.id)).map(toRegistrationRow);
}

/**
 * Verstuurt lokale wijzigingen en haalt wijzigingen van anderen op. Gooit een fout bij een
 * verbindingsprobleem; dan blijft alles in de wachtrij staan voor de volgende poging.
 */
export async function runSync(data: AppData, meta: SyncMeta): Promise<SyncResult> {
  const db = client();
  const sent: Record<string, number> = {};
  const errors: string[] = [];
  let refetchAll = false;

  const byTable: Record<Table, { upsert: string[]; remove: string[] }> = {
    projects: { upsert: [], remove: [] },
    sections: { upsert: [], remove: [] },
    registrations: { upsert: [], remove: [] },
  };
  const exists: Record<Table, Set<string>> = {
    projects: new Set(data.projects.map((p) => p.id)),
    sections: new Set(data.sections.map((s) => s.id)),
    registrations: new Set(data.registrations.map((r) => r.id)),
  };
  for (const key of Object.keys(meta.pending)) {
    const [table, id] = splitKey(key);
    if (!byTable[table]) continue;
    byTable[table][exists[table].has(id) ? 'upsert' : 'remove'].push(id);
  }

  const handleRowError = (table: Table, id: string, error: DbError) => {
    const key = `${table}:${id}`;
    if (!isDatabaseError(error)) throw new Error(error.message);
    if (isRuleViolation(error)) {
      // De server weigert de wijziging: lokale versie vervangen door die van de server.
      sent[key] = meta.pending[key];
      refetchAll = true;
    }
    errors.push(error.message);
  };

  // Versturen: eerst projecten, dan tracédelen, dan registraties (vanwege de verwijzingen).
  for (const table of TABLES) {
    const ids = byTable[table].upsert;
    if (ids.length === 0) continue;
    if (table === 'registrations') {
      for (const r of data.registrations) if (ids.includes(r.id)) await uploadPhotos(r.id, r.photos);
    }
    const rows: { id: string }[] = rowsFor(table, data, ids);
    const { error } = await db.from(table).upsert(rows);
    if (!error) {
      for (const id of ids) sent[`${table}:${id}`] = meta.pending[`${table}:${id}`];
      continue;
    }
    if (!isDatabaseError(error)) throw new Error(error.message);
    // Eén record wordt geweigerd: per record opnieuw, zodat de rest wel doorkomt.
    for (const row of rows) {
      const single = await db.from(table).upsert(row);
      if (single.error) handleRowError(table, row.id, single.error);
      else sent[`${table}:${row.id}`] = meta.pending[`${table}:${row.id}`];
    }
  }

  // Verwijderen gebeurt alleen als markering, zodat andere toestellen het ook verwijderen.
  for (const table of ['sections', 'projects'] as const) {
    for (const id of byTable[table].remove) {
      const { error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
      if (error) handleRowError(table, id, error);
      else sent[`${table}:${id}`] = meta.pending[`${table}:${id}`];
    }
  }
  for (const id of byTable.registrations.remove) sent[`registrations:${id}`] = meta.pending[`registrations:${id}`];

  // Ophalen.
  const since = !refetchAll && meta.cursor ? new Date(new Date(meta.cursor).getTime() - OVERLAP_MS).toISOString() : null;
  let cursor = refetchAll ? null : meta.cursor;
  const pulled: Pulled = { projects: [], sections: [], registrations: [] };
  for (const table of TABLES) {
    for (let from = 0; ; from += PAGE) {
      let query = db.from(table).select('*');
      if (since) query = query.gt('updated_at', since);
      const { data: rows, error } = await query.order('updated_at').order('id').range(from, from + PAGE - 1);
      if (error) throw new Error(error.message);
      (pulled[table] as { updated_at?: string }[]).push(...rows);
      for (const row of rows as { updated_at: string }[]) {
        if (!cursor || row.updated_at > cursor) cursor = row.updated_at;
      }
      if (rows.length < PAGE) break;
    }
  }

  return { sent, pulled, cursor, errors };
}

/** Haalt foto's op die bij registraties horen maar nog niet op dit toestel staan (bijv. van een collega). */
export async function downloadMissingPhotos(data: AppData, limit = 50): Promise<number> {
  const missing: { path: string; uri: string }[] = [];
  for (const r of data.registrations) {
    for (const uri of r.photos) {
      if (missing.length >= limit) break;
      if (!photoExists(uri)) missing.push({ path: photoPath(r.id, uri), uri });
    }
  }
  if (missing.length === 0) return 0;
  const { data: signed, error } = await client()
    .storage.from(PHOTO_BUCKET)
    .createSignedUrls(
      missing.map((m) => m.path),
      600,
    );
  if (error) throw new Error(error.message);
  let count = 0;
  for (const [i, m] of missing.entries()) {
    const url = signed[i]?.signedUrl;
    if (!url) continue;
    try {
      await downloadPhoto(url, m.uri);
      count++;
    } catch (e) {
      console.warn('Foto ophalen mislukt', m.path, e);
    }
  }
  return count;
}
