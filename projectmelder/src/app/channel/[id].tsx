// Chat in een kanaal (FO §5.3): tekst, spraak, foto; lang indrukken = "Maak melding".
import * as Crypto from 'expo-crypto';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionSheetIOS, Alert, FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AttachmentList, CaptureList } from '../../components/Media';
import { colors, Muted } from '../../components/ui';
import { VoiceRecorder } from '../../components/VoiceRecorder';
import type { Attachment, Channel, Message } from '../../domain/types';
import { getAttachments, getChannel, getMessages, retractMessage } from '../../lib/api';
import { openDraft } from '../../lib/draft';
import { currentFix } from '../../lib/location';
import { Capture, takePhoto } from '../../lib/media';
import { enqueue, useOutbox } from '../../lib/outbox';
import { memberName, useSession } from '../../lib/session';
import { supabase } from '../../lib/supabase';

type Pending = { message: Message; captures: Capture[] };

export default function ChannelScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, members } = useSession();
  const outbox = useOutbox();
  const [channel, setChannel] = useState<Channel | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [attachments, setAttachments] = useState<Record<string, Attachment[]>>({});
  const [text, setText] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const list = useRef<FlatList<Message>>(null);

  const loadAttachments = useCallback(async (msgs: Message[]) => {
    const ids = msgs.filter((m) => m.kind === 'foto' || m.kind === 'spraak').map((m) => m.id);
    const att = await getAttachments({ messageIds: ids });
    const by: Record<string, Attachment[]> = {};
    att.forEach((a) => (by[a.message_id!] ??= []).push(a));
    setAttachments(by);
  }, []);

  const load = useCallback(async () => {
    const [c, msgs] = await Promise.all([getChannel(id), getMessages(id)]);
    setChannel(c);
    setMessages(msgs);
    void loadAttachments(msgs);
  }, [id, loadAttachments]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- gegevens worden asynchroon geladen
    void load();
    const ch = supabase
      .channel(`messages-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `channel_id=eq.${id}` }, () => void load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'attachments' }, () => void load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [id, load]);

  const pending: Pending[] = outbox.flatMap((e) =>
    e.op === 'message' && e.message.channel_id === id
      ? [{ message: { ...e.message, retracted_at: null, created_at: e.message.captured_at ?? new Date().toISOString() } as Message, captures: e.captures }]
      : [],
  );
  const pendingIds = new Set(pending.map((p) => p.message.id));
  const all = [...messages.filter((m) => !pendingIds.has(m.id)), ...pending.map((p) => p.message)];

  async function send(kind: Message['kind'], body: string | null, transcript: string | null, captures: Capture[]) {
    if (!session || !channel) return;
    const fix = captures.find((c) => c.fix)?.fix ?? (await currentFix(4000));
    const msgId = Crypto.randomUUID();
    await enqueue({
      id: msgId,
      op: 'message',
      projectId: channel.project_id,
      captures,
      message: {
        id: msgId,
        channel_id: channel.id,
        sender_id: session.user.id,
        kind,
        body,
        transcript,
        item_id: null,
        captured_at: captures[0]?.captured_at ?? new Date().toISOString(),
        lat: fix?.lat ?? null,
        lng: fix?.lng ?? null,
        accuracy: fix?.accuracy ?? null,
      },
    });
    setTimeout(() => list.current?.scrollToEnd({ animated: true }), 100);
  }

  function makeItem(m: Message, captures: Capture[] = []) {
    openDraft({
      projectId: channel!.project_id,
      text: m.transcript ?? m.body ?? '',
      captures,
      channelId: channel!.id,
      sourceMessageId: m.id,
    });
  }

  function onLongPress(m: Message) {
    if (m.retracted_at || pendingIds.has(m.id)) return;
    const mineMsg = m.sender_id === session?.user.id;
    const options = ['Maak melding', ...(mineMsg ? ['Bericht intrekken'] : []), 'Annuleren'];
    const act = (i: number) => {
      if (options[i] === 'Maak melding') makeItem(m);
      if (options[i] === 'Bericht intrekken')
        retractMessage(m.id)
          .then(load)
          .catch((e) => Alert.alert('Intrekken mislukt', String(e)));
    };
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, destructiveButtonIndex: mineMsg ? 1 : undefined }, act);
    } else {
      Alert.alert('Bericht', undefined, options.map((o, i) => ({ text: o, style: o === 'Annuleren' ? 'cancel' : o.includes('intrekken') ? 'destructive' : 'default', onPress: () => act(i) })));
    }
  }

  const renderItem = ({ item: m }: { item: Message }) => {
    const mine = m.sender_id === session?.user.id;
    const isPending = pendingIds.has(m.id);
    const pendingCaps = pending.find((p) => p.message.id === m.id)?.captures ?? [];
    return (
      <Pressable onLongPress={() => onLongPress(m)} delayLongPress={350} style={[s.bubble, mine ? s.mine : s.theirs]}>
        {!mine && <Text style={s.sender}>{memberName(members, m.sender_id)}</Text>}
        {m.retracted_at ? (
          <Text style={s.retracted}>Bericht ingetrokken</Text>
        ) : (
          <>
            {m.kind === 'melding' && m.item_id ? (
              <Pressable onPress={() => router.push(`/item/${m.item_id}`)}>
                <Text style={[s.body, { fontWeight: '700', color: colors.primary }]}>📌 {m.body}</Text>
                <Muted>Tik om de melding te openen</Muted>
              </Pressable>
            ) : m.body ? (
              <Text style={s.body}>{m.body}</Text>
            ) : null}
            {isPending ? <CaptureList captures={pendingCaps} /> : attachments[m.id] ? <AttachmentList items={attachments[m.id]} /> : null}
            {m.kind === 'spraak' && m.transcript ? <Text style={[s.body, { fontStyle: 'italic' }]}>“{m.transcript}”</Text> : null}
          </>
        )}
        <Text style={s.time}>
          {new Date(m.captured_at ?? m.created_at).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          {m.lat != null ? ' · 📍' : ''}
          {isPending ? ' · ⏳ wacht op verbinding' : ''}
        </Text>
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['bottom']}>
      <Stack.Screen options={{ title: channel?.name ?? 'Chat' }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={all}
          keyExtractor={(m) => m.id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12, maxWidth: 900, width: '100%', alignSelf: 'center' }}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          ListEmptyComponent={<Muted style={{ textAlign: 'center', marginTop: 32 }}>Nog geen berichten. Houd een bericht ingedrukt om er een melding van te maken.</Muted>}
        />
        {voiceOpen && (
          <View style={s.voice}>
            <VoiceRecorder
              compact
              hints={members.map((m) => m.full_name)}
              label="Houd ingedrukt om een spraakbericht in te spreken"
              onDone={(r) => {
                setVoiceOpen(false);
                void send('spraak', null, r.transcript || null, r.audio ? [r.audio] : []);
              }}
            />
          </View>
        )}
        <View style={s.inputBar}>
          <Pressable
            style={s.iconBtn}
            accessibilityLabel="Foto"
            onPress={async () => {
              try {
                const c = await takePhoto();
                if (c) await send('foto', text.trim() || null, null, [c]);
                setText('');
              } catch (e) {
                Alert.alert('Foto', String(e));
              }
            }}
          >
            <Text style={s.icon}>📷</Text>
          </Pressable>
          <TextInput value={text} onChangeText={setText} placeholder="Bericht" style={s.input} multiline placeholderTextColor={colors.muted} />
          {text.trim() ? (
            <Pressable
              style={[s.iconBtn, { backgroundColor: colors.primary }]}
              accessibilityLabel="Versturen"
              onPress={() => {
                void send('tekst', text.trim(), null, []);
                setText('');
              }}
            >
              <Text style={[s.icon, { color: '#fff' }]}>➤</Text>
            </Pressable>
          ) : (
            <Pressable style={[s.iconBtn, voiceOpen && { backgroundColor: colors.danger }]} accessibilityLabel="Spraakbericht" onPress={() => setVoiceOpen(!voiceOpen)}>
              <Text style={s.icon}>🎤</Text>
            </Pressable>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  bubble: { maxWidth: '85%', borderRadius: 12, padding: 10, marginBottom: 8 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.bubbleMine },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
  sender: { fontWeight: '700', color: colors.primary, marginBottom: 2 },
  body: { fontSize: 16, color: colors.text, marginBottom: 4 },
  retracted: { fontStyle: 'italic', color: colors.muted },
  time: { fontSize: 12, color: colors.muted, alignSelf: 'flex-end' },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', padding: 8, gap: 6, backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border },
  input: { flex: 1, minHeight: 48, maxHeight: 120, fontSize: 17, borderRadius: 24, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, color: colors.text },
  iconBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.neutralBg },
  icon: { fontSize: 22 },
  voice: { padding: 12, backgroundColor: colors.card, borderTopWidth: 1, borderColor: colors.border },
});
