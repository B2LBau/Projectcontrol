// Tabelweergave van meldingen voor desktop/webapp (FO §5.12): sorteerbare kolommen, klik opent de melding.
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { deadlineColor } from '../domain/deadlines';
import type { SortDir, SortKey } from '../domain/overview';
import { isClosed, statusLabel } from '../domain/status';
import { Item, ITEM_TYPE_INFO, SEVERITY_LABELS } from '../domain/types';
import { colors } from './ui';

type Col = { key: SortKey; label: string; flex: number };

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '–';

export function ItemTable({
  items,
  showProject,
  sortKey,
  sortDir,
  onSort,
  ownerName,
  projectCode,
}: {
  items: Item[];
  showProject: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (k: SortKey) => void;
  ownerName: (id: string | null) => string;
  projectCode: (id: string) => string;
}) {
  const cols: Col[] = [
    ...(showProject ? [{ key: 'project' as const, label: 'Project', flex: 0.9 }] : []),
    { key: 'number', label: 'Nr', flex: 1.2 },
    { key: 'type', label: 'Type', flex: 1.6 },
    { key: 'title', label: 'Omschrijving', flex: 3.4 },
    { key: 'owner', label: 'Eigenaar', flex: 1.6 },
    { key: 'due', label: 'Termijn', flex: 0.9 },
    { key: 'status', label: 'Status', flex: 1.3 },
    { key: 'severity', label: 'Ernst', flex: 0.8 },
    { key: 'created', label: 'Gemeld', flex: 0.9 },
  ];
  const now = new Date();

  const cell = (i: Item, k: SortKey) => {
    const closed = isClosed(i.type, i.status);
    switch (k) {
      case 'project':
        return <Text style={s.text}>{projectCode(i.project_id)}</Text>;
      case 'number':
        return <Text style={[s.text, { color: colors.muted }]}>{i.number}</Text>;
      case 'type': {
        const t = ITEM_TYPE_INFO[i.type];
        return <Text style={[s.text, { color: t.color, fontWeight: '700' }]}>{`${t.icon} ${t.label}`}</Text>;
      }
      case 'title':
        return (
          <Text style={[s.text, { fontWeight: '600' }, i.status === 'ingetrokken' && { textDecorationLine: 'line-through' }]} numberOfLines={2}>
            {i.title}
            {i.location_label ? <Text style={{ color: colors.muted, fontWeight: '400' }}>{`  · ${i.location_label}`}</Text> : null}
          </Text>
        );
      case 'owner':
        return (
          <Text style={s.text} numberOfLines={1}>
            {i.owner_id ? ownerName(i.owner_id) : '–'}
          </Text>
        );
      case 'due':
        return (
          <Text style={[s.text, { fontWeight: '700', color: deadlineColor(i.due_at ? new Date(i.due_at) : null, now, closed) }]}>
            {fmtDate(i.due_at)}
          </Text>
        );
      case 'status':
        return <Text style={[s.text, closed && { color: colors.ok }]}>{statusLabel(i.type, i.status)}</Text>;
      case 'severity':
        return (
          <Text style={[s.text, i.severity === 'kritiek' ? { color: colors.danger, fontWeight: '700' } : i.severity === 'hoog' ? { color: colors.warn, fontWeight: '700' } : null]}>
            {SEVERITY_LABELS[i.severity]}
          </Text>
        );
      case 'created':
        return <Text style={[s.text, { color: colors.muted }]}>{fmtDate(i.captured_at ?? i.created_at)}</Text>;
    }
  };

  return (
    <ScrollView horizontal contentContainerStyle={{ minWidth: '100%' }}>
      <View style={s.table}>
        <View style={[s.row, s.head]}>
          <View style={{ width: 4 }} />
          {cols.map((c) => (
            <Pressable key={c.key} onPress={() => onSort(c.key)} style={[s.cell, { flex: c.flex }]} accessibilityRole="button" accessibilityLabel={`Sorteer op ${c.label}`}>
              <Text style={s.headText}>
                {c.label}
                {sortKey === c.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
              </Text>
            </Pressable>
          ))}
        </View>
        {items.map((i, idx) => (
          <Pressable
            key={i.id}
            onPress={() => router.push(`/item/${i.id}`)}
            style={({ pressed }) => [s.row, idx % 2 === 1 && { backgroundColor: '#F7F9FB' }, pressed && { backgroundColor: '#E3EEFB' }]}
          >
            <View style={[s.typeBar, { backgroundColor: ITEM_TYPE_INFO[i.type].color }]} />
            {cols.map((c) => (
              <View key={c.key} style={[s.cell, { flex: c.flex }]}>
                {cell(i, c.key)}
              </View>
            ))}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  table: { flex: 1, minWidth: 960, backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderColor: colors.border, minHeight: 48 },
  head: { backgroundColor: colors.primary, minHeight: 44 },
  headText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  cell: { paddingHorizontal: 10, paddingVertical: 8, justifyContent: 'center' },
  text: { fontSize: 14, color: colors.text },
  typeBar: { width: 4, alignSelf: 'stretch' },
});
