// Chats: kanalen van het gekozen project, zoals WhatsApp (FO §3.2).
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ProjectSwitcher } from '../../components/ProjectSwitcher';
import { colors, Empty, Muted } from '../../components/ui';
import type { Channel, Message } from '../../domain/types';
import { getChannels, lastMessages } from '../../lib/api';
import { memberName, useSession } from '../../lib/session';

const KIND_ICON: Record<Channel['kind'], string> = { algemeen: '👥', intern: '🔒', oa: '🏗', werkpakket: '🧰', direct: '👤' };

function preview(m: Message | undefined, members: ReturnType<typeof useSession>['members']): string {
  if (!m) return 'Nog geen berichten';
  if (m.retracted_at) return 'Bericht ingetrokken';
  const who = memberName(members, m.sender_id).split(' ')[0];
  const body = m.kind === 'foto' ? '📷 Foto' : m.kind === 'spraak' ? `🎤 ${m.transcript ?? 'Spraakbericht'}` : m.kind === 'melding' ? `📌 ${m.body ?? 'Melding'}` : m.body ?? '';
  return `${who}: ${body}`;
}

function when(iso: string): string {
  const d = new Date(iso);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
}

export default function Chats() {
  const { project, members } = useSession();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [last, setLast] = useState<Record<string, Message>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!project) return;
    setLoading(true);
    try {
      const ch = await getChannels(project.id);
      setChannels(ch);
      setLast(await lastMessages(ch.map((c) => c.id)));
    } finally {
      setLoading(false);
    }
  }, [project]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const sorted = [...channels].sort((a, b) => (last[b.id]?.created_at ?? '').localeCompare(last[a.id]?.created_at ?? ''));

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ padding: 16, maxWidth: 900, width: '100%', alignSelf: 'center' }}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <ProjectSwitcher />
      {sorted.length === 0 && !loading ? <Empty title="Geen kanalen" /> : null}
      {sorted.map((c) => {
        const m = last[c.id];
        return (
          <Pressable key={c.id} onPress={() => router.push(`/channel/${c.id}`)} style={({ pressed }) => [s.row, pressed && { opacity: 0.8 }]}>
            <Text style={s.icon}>{KIND_ICON[c.kind]}</Text>
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={s.name}>{c.name}</Text>
                {m && <Muted>{when(m.created_at)}</Muted>}
              </View>
              <Text style={s.preview} numberOfLines={1}>
                {preview(m, members)}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 72,
  },
  icon: { fontSize: 28, width: 44 },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  preview: { color: colors.muted, fontSize: 15, marginTop: 2 },
});
