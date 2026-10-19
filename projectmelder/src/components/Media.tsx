import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { useEffect, useState } from 'react';
import { Image, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { Attachment } from '../domain/types';
import { formatFix } from '../lib/location';
import type { Capture } from '../lib/media';
import { signedUrl } from '../lib/media';
import { colors, Muted } from './ui';

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'onbekend';

function useSigned(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (path) signedUrl(path).then(setUrl);
  }, [path]);
  return url;
}

export function AudioPlayer({ uri, durationMs }: { uri: string | null; durationMs: number | null }) {
  const player = useAudioPlayer(uri ? { uri } : null);
  const status = useAudioPlayerStatus(player);
  const secs = Math.round((durationMs ?? (status.duration ?? 0) * 1000) / 1000);
  return (
    <Pressable
      onPress={() => {
        if (!uri) return;
        if (status.playing) player.pause();
        else {
          if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) player.seekTo(0);
          player.play();
        }
      }}
      style={s.audio}
      accessibilityRole="button"
      accessibilityLabel="Spraakopname afspelen"
    >
      <Text style={s.audioIcon}>{status.playing ? '❚❚' : '▶'}</Text>
      <Text style={{ color: colors.text, fontWeight: '600' }}>
        Spraakopname {Math.floor(secs / 60)}:{String(secs % 60).padStart(2, '0')}
      </Text>
    </Pressable>
  );
}

function Meta({ a }: { a: Pick<Attachment, 'captured_at' | 'capture_end_at' | 'lat' | 'lng' | 'accuracy' | 'source'> }) {
  return (
    <Muted style={{ fontSize: 12, marginTop: 2 }}>
      {fmt(a.captured_at)}
      {a.capture_end_at ? ` – ${new Date(a.capture_end_at).toLocaleTimeString('nl-NL')}` : ''} · {formatFix(a)}
      {a.source === 'galerij' ? ' · geïmporteerd' : ''}
    </Muted>
  );
}

function RemoteAttachment({ a, onOpen }: { a: Attachment; onOpen: (url: string, a: Attachment) => void }) {
  const url = useSigned(a.storage_path);
  if (a.kind === 'spraak') {
    return (
      <View style={{ marginBottom: 8 }}>
        <AudioPlayer uri={url} durationMs={a.duration_ms} />
        <Meta a={a} />
      </View>
    );
  }
  return (
    <Pressable onPress={() => url && onOpen(url, a)} style={s.thumbWrap}>
      {url ? <Image source={{ uri: url }} style={s.thumb} /> : <View style={[s.thumb, { backgroundColor: colors.neutralBg }]} />}
    </Pressable>
  );
}

/** Bijlagen van een melding of bericht, met tijd en locatie van opname. */
export function AttachmentList({ items }: { items: Attachment[] }) {
  const [open, setOpen] = useState<{ url: string; a: Attachment } | null>(null);
  const photos = items.filter((a) => a.kind !== 'spraak');
  const audio = items.filter((a) => a.kind === 'spraak');
  return (
    <View>
      {audio.map((a) => (
        <RemoteAttachment key={a.id} a={a} onOpen={() => {}} />
      ))}
      {photos.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {photos.map((a) => (
            <RemoteAttachment key={a.id} a={a} onOpen={(url, x) => setOpen({ url, a: x })} />
          ))}
        </ScrollView>
      )}
      <Modal visible={!!open} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <Pressable style={s.modal} onPress={() => setOpen(null)}>
          {open && (
            <>
              <Image source={{ uri: open.url }} style={s.full} resizeMode="contain" />
              <View style={s.caption}>
                <Text style={{ color: '#fff' }}>
                  {fmt(open.a.captured_at)} · {formatFix(open.a)}
                  {open.a.heading != null ? ` · richting ${Math.round(open.a.heading)}°` : ''}
                </Text>
                {open.a.lat != null && (
                  <Text
                    style={{ color: '#9cc3ff', marginTop: 6 }}
                    onPress={() => Linking.openURL(`https://www.openstreetmap.org/?mlat=${open.a.lat}&mlon=${open.a.lng}#map=19/${open.a.lat}/${open.a.lng}`)}
                  >
                    Toon op kaart
                  </Text>
                )}
              </View>
            </>
          )}
        </Pressable>
      </Modal>
    </View>
  );
}

/** Nog niet verzonden opnames (lokaal), met de vastgelegde metadata. */
export function CaptureList({ captures, onRemove }: { captures: Capture[]; onRemove?: (id: string) => void }) {
  return (
    <View>
      {captures.map((c) => (
        <View key={c.id} style={s.captureRow}>
          {c.kind === 'spraak' ? (
            <View style={{ flex: 1 }}>
              <AudioPlayer uri={c.uri} durationMs={c.duration_ms} />
            </View>
          ) : (
            <Image source={{ uri: c.uri }} style={s.smallThumb} />
          )}
          <View style={{ flex: c.kind === 'spraak' ? 0 : 1, marginLeft: 8 }}>
            {c.kind !== 'spraak' && (
              <Meta a={{ captured_at: c.captured_at, capture_end_at: null, lat: c.fix?.lat ?? null, lng: c.fix?.lng ?? null, accuracy: c.fix?.accuracy ?? null, source: c.source }} />
            )}
            {c.metadata_missing && <Muted style={{ color: colors.warn, fontSize: 12 }}>Tijd/locatie van foto onbekend</Muted>}
          </View>
          {onRemove && (
            <Pressable onPress={() => onRemove(c.id)} style={s.remove} accessibilityLabel="Verwijderen">
              <Text style={{ fontSize: 18, color: colors.danger }}>✕</Text>
            </Pressable>
          )}
        </View>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  audio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.neutralBg,
    borderRadius: 24,
    paddingHorizontal: 14,
    minHeight: 48,
    alignSelf: 'flex-start',
  },
  audioIcon: { fontSize: 18, color: colors.primary, width: 22, textAlign: 'center' },
  thumbWrap: { marginRight: 8 },
  thumb: { width: 120, height: 120, borderRadius: 8 },
  smallThumb: { width: 64, height: 64, borderRadius: 6 },
  captureRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  remove: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center' },
  full: { width: '100%', height: '80%' },
  caption: { padding: 16 },
});
