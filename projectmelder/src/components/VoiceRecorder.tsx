// Spraak inspreken (FO §5.4): ingedrukt houden = walkietalkie, kort tikken = handsfree tot "Stop".
// Spraak wordt op het toestel omgezet naar tekst; de opname zelf wordt bewaard als bewijs,
// met melder, start- en eindtijd en GPS-positie.
import * as Crypto from 'expo-crypto';
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { currentFix, distanceM, Fix } from '../lib/location';
import { Capture, persistLocally } from '../lib/media';
import { colors, Muted } from './ui';

export type VoiceResult = { transcript: string; audio: Capture | null };

const TAP_MS = 400;
const MAX_MS = 5 * 60 * 1000;

export function VoiceRecorder({
  onDone,
  hints = [],
  label = 'Houd ingedrukt om in te spreken',
  compact,
}: {
  onDone: (r: VoiceResult) => void;
  hints?: string[];
  label?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'locked' | 'finishing'>('idle');
  const [live, setLive] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finals = useRef<string[]>([]);
  const interim = useRef('');
  const pressedAt = useRef(0);
  const startFix = useRef<Promise<Fix | null> | null>(null);
  const audio = useRef<{ uri: string | null; start: number | null; end: number | null }>({ uri: null, start: null, end: null });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useSpeechRecognitionEvent('result', (e) => {
    const text = e.results[0]?.transcript ?? '';
    if (e.isFinal) {
      finals.current.push(text);
      interim.current = '';
    } else interim.current = text;
    setLive([...finals.current, interim.current].join(' ').trim());
  });
  useSpeechRecognitionEvent('audiostart', (e) => {
    audio.current.uri = e.uri;
    audio.current.start = e.timestamp;
  });
  useSpeechRecognitionEvent('audioend', (e) => {
    audio.current.uri = e.uri ?? audio.current.uri;
    audio.current.end = e.timestamp;
  });
  useSpeechRecognitionEvent('error', (e) => {
    if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Spraakherkenning: ${e.message || e.error}`);
  });

  async function begin() {
    setError(null);
    const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!perm.granted) {
      setError('Geen toestemming voor microfoon/spraakherkenning.');
      setState('idle');
      return;
    }
    finals.current = [];
    interim.current = '';
    audio.current = { uri: null, start: Date.now(), end: null };
    setLive('');
    startFix.current = currentFix();
    ExpoSpeechRecognitionModule.start({
      lang: 'nl-NL',
      interimResults: true,
      continuous: true,
      addsPunctuation: true,
      contextualStrings: hints.slice(0, 100),
      recordingOptions: { persist: Platform.OS !== 'web' },
    });
    timer.current = setTimeout(() => ExpoSpeechRecognitionModule.stop(), MAX_MS);
  }

  async function finish() {
    if (timer.current) clearTimeout(timer.current);
    setState((s) => (s === 'idle' ? s : 'finishing'));
    const transcript = [...finals.current, interim.current].join(' ').replace(/\s+/g, ' ').trim();
    const fix = (await startFix.current) ?? null;
    const endFix = await currentFix(3000);
    const a = audio.current;
    // Eindpositie alleen vastleggen als de melder zich duidelijk verplaatst heeft (> 25 m).
    const moved = fix && endFix && distanceM(fix, endFix) > 25 ? endFix : null;
    let capture: Capture | null = null;
    if (a.uri) {
      const start = a.start ?? Date.now();
      const end = a.end ?? Date.now();
      capture = {
        id: Crypto.randomUUID(),
        kind: 'spraak',
        uri: persistLocally(a.uri, a.uri.endsWith('.caf') ? 'caf' : 'wav'),
        mime: a.uri.endsWith('.caf') ? 'audio/x-caf' : 'audio/wav',
        source: 'microfoon',
        captured_at: new Date(start).toISOString(),
        capture_end_at: new Date(end).toISOString(),
        duration_ms: Math.max(0, Math.round(end - start)),
        fix,
        end_fix: moved,
      };
    }
    setState('idle');
    startFix.current = null;
    if (transcript || capture) onDone({ transcript, audio: capture });
  }

  useSpeechRecognitionEvent('end', () => {
    void finish();
  });

  function pressIn() {
    if (state === 'locked') {
      ExpoSpeechRecognitionModule.stop();
      return;
    }
    if (state !== 'idle') return;
    pressedAt.current = Date.now();
    setState('recording');
    void begin();
  }

  function pressOut() {
    if (state === 'locked' || state === 'finishing') return;
    if (Date.now() - pressedAt.current < TAP_MS) {
      setState('locked'); // kort getikt: blijf opnemen tot opnieuw tikken
    } else {
      ExpoSpeechRecognitionModule.stop();
    }
  }

  const active = state === 'recording' || state === 'locked';
  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        accessibilityRole="button"
        accessibilityLabel={active ? 'Stop opname' : 'Start spraakopname'}
        style={[
          s.mic,
          compact && s.micCompact,
          { backgroundColor: active ? colors.danger : state === 'finishing' ? colors.muted : colors.primary },
        ]}
      >
        <Text style={[s.micIcon, compact && { fontSize: 30 }]}>{active ? '■' : '🎤'}</Text>
      </Pressable>
      <Muted style={{ marginTop: 8, textAlign: 'center' }}>
        {state === 'locked'
          ? 'Opname loopt – tik om te stoppen'
          : state === 'recording'
            ? 'Opname loopt – loslaten om te stoppen'
            : state === 'finishing'
              ? 'Verwerken…'
              : label}
      </Muted>
      {live ? <Text style={s.live}>{live}</Text> : null}
      {error ? <Text style={[s.live, { color: colors.danger }]}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  mic: {
    width: 128,
    height: 128,
    borderRadius: 64,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  micCompact: { width: 76, height: 76, borderRadius: 38 },
  micIcon: { fontSize: 48, color: '#fff' },
  live: { marginTop: 10, fontSize: 17, color: colors.text, textAlign: 'center', maxWidth: 600 },
});
