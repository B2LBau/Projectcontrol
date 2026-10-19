// Foto's en spraakopnames met vastlegging van melder, tijd en locatie (FO §5.2).
import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

import type { AttachmentKind, AttachmentSource } from '../domain/types';
import { currentFix, Fix } from './location';
import { MEDIA_BUCKET, supabase } from './supabase';

/** Lokaal vastgelegd bestand, klaar om (ook later, offline) te uploaden. */
export type Capture = {
  id: string;
  kind: AttachmentKind;
  uri: string;
  mime: string;
  source: AttachmentSource;
  captured_at: string | null;
  capture_end_at: string | null;
  duration_ms: number | null;
  fix: Fix | null;
  /** Positie aan het eind van een spraakopname, alleen als die > 25 m afwijkt */
  end_fix?: Fix | null;
  /** EXIF-tijd/locatie ontbrak bij een geïmporteerde foto */
  metadata_missing?: boolean;
};

function outboxDir(): Directory | null {
  if (Platform.OS === 'web') return null;
  const dir = new Directory(Paths.document, 'outbox');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Kopieert naar de app-map zodat het bestand een offline periode overleeft. */
export function persistLocally(uri: string, ext: string): string {
  const dir = outboxDir();
  if (!dir) return uri;
  const dest = new File(dir, `${Crypto.randomUUID()}.${ext}`);
  new File(uri).copy(dest);
  return dest.uri;
}

function exifDate(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = (exif?.DateTimeOriginal ?? exif?.DateTime) as string | undefined;
  const m = raw?.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  // EXIF-tijd is lokale tijd van het toestel
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString();
}

function exifFix(exif: Record<string, unknown> | null | undefined): Fix | null {
  const lat = exif?.GPSLatitude as number | undefined;
  const lng = exif?.GPSLongitude as number | undefined;
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  const latRef = exif?.GPSLatitudeRef === 'S' ? -1 : 1;
  const lngRef = exif?.GPSLongitudeRef === 'W' ? -1 : 1;
  return {
    lat: lat * latRef,
    lng: lng * lngRef,
    accuracy: null,
    altitude: (exif?.GPSAltitude as number) ?? null,
    heading: (exif?.GPSImgDirection as number) ?? null,
    at: exifDate(exif) ?? new Date().toISOString(),
  };
}

export async function takePhoto(): Promise<Capture | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Geen toegang tot de camera');
  const fixPromise = currentFix();
  const res = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.7, exif: true });
  if (res.canceled || !res.assets[0]) return null;
  const capturedAt = new Date().toISOString();
  const a = res.assets[0];
  const fix = await fixPromise;
  return {
    id: Crypto.randomUUID(),
    kind: 'foto',
    uri: persistLocally(a.uri, 'jpg'),
    mime: a.mimeType ?? 'image/jpeg',
    source: 'camera',
    captured_at: capturedAt,
    capture_end_at: null,
    duration_ms: null,
    fix,
  };
}

export async function pickPhotos(): Promise<Capture[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.7,
    exif: true,
    allowsMultipleSelection: true,
    selectionLimit: 10,
  });
  if (res.canceled) return [];
  return res.assets.map((a) => {
    const at = exifDate(a.exif);
    const fix = exifFix(a.exif);
    return {
      id: Crypto.randomUUID(),
      kind: 'foto' as const,
      uri: persistLocally(a.uri, 'jpg'),
      mime: a.mimeType ?? 'image/jpeg',
      source: 'galerij' as const,
      captured_at: at,
      capture_end_at: null,
      duration_ms: null,
      fix,
      metadata_missing: !at || !fix,
    };
  });
}

function extFor(mime: string): string {
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('png')) return 'png';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('caf')) return 'caf';
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('webm')) return 'webm';
  return 'bin';
}

async function readBytes(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) {
    const r = await fetch(uri);
    return r.arrayBuffer();
  }
  return new File(uri).arrayBuffer();
}

/** Uploadt het bestand en legt de bijlage met metadata vast. Idempotent op capture.id. */
export async function uploadCapture(
  c: Capture,
  target: { projectId: string; itemId?: string | null; messageId?: string | null },
): Promise<void> {
  const path = `${target.projectId}/${c.id}.${extFor(c.mime)}`;
  const { error: upErr } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(path, await readBytes(c.uri), { contentType: c.mime, upsert: false });
  if (upErr && !/exists|duplicate/i.test(upErr.message)) throw upErr;

  const { error } = await supabase.from('attachments').upsert(
    {
      id: c.id,
      project_id: target.projectId,
      item_id: target.itemId ?? null,
      message_id: target.messageId ?? null,
      kind: c.kind,
      storage_path: path,
      mime: c.mime,
      captured_at: c.captured_at,
      capture_end_at: c.capture_end_at,
      lat: c.fix?.lat ?? null,
      lng: c.fix?.lng ?? null,
      accuracy: c.fix?.accuracy ?? null,
      heading: c.fix?.heading ?? null,
      end_lat: c.end_fix?.lat ?? null,
      end_lng: c.end_fix?.lng ?? null,
      source: c.source,
      duration_ms: c.duration_ms,
    },
    { onConflict: 'id', ignoreDuplicates: true },
  );
  if (error) throw error;
  removeLocal(c.uri);
}

export function removeLocal(uri: string) {
  if (Platform.OS === 'web' || !uri.startsWith('file:')) return;
  try {
    const f = new File(uri);
    if (f.exists && uri.includes('/outbox/')) f.delete();
  } catch {
    // niet erg: wordt bij volgende opruimronde verwijderd
  }
}

const urlCache = new Map<string, { url: string; until: number }>();

export async function signedUrl(path: string): Promise<string | null> {
  const hit = urlCache.get(path);
  if (hit && hit.until > Date.now()) return hit.url;
  const { data } = await supabase.storage.from(MEDIA_BUCKET).createSignedUrl(path, 3600);
  if (!data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}
