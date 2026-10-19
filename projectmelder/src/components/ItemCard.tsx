import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { deadlineColor } from '../domain/deadlines';
import { isClosed, statusLabel } from '../domain/status';
import { Item, ITEM_TYPE_INFO, Member } from '../domain/types';
import { memberName } from '../lib/session';
import { Badge, colors } from './ui';

export function dueText(due: string | null): string {
  if (!due) return 'geen termijn';
  const d = new Date(due);
  return d.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function ItemCard({ item, members, pending }: { item: Item; members: Member[]; pending?: boolean }) {
  const info = ITEM_TYPE_INFO[item.type];
  const closed = isClosed(item.type, item.status);
  const dueColor = deadlineColor(item.due_at ? new Date(item.due_at) : null, new Date(), closed);
  return (
    <Pressable
      onPress={() => !pending && router.push(`/item/${item.id}`)}
      style={({ pressed }) => [s.card, { borderLeftColor: info.color, opacity: pressed ? 0.85 : closed ? 0.7 : 1 }]}
      accessibilityRole="button"
    >
      <View style={s.top}>
        <Badge label={`${info.icon} ${info.label}`} color={info.color} />
        <Text style={s.number}>{pending ? 'wacht op verzending' : item.number}</Text>
      </View>
      <Text style={[s.title, closed && { textDecorationLine: item.status === 'ingetrokken' ? 'line-through' : 'none' }]} numberOfLines={2}>
        {item.title}
      </Text>
      <View style={s.bottom}>
        <Text style={s.meta} numberOfLines={1}>
          {memberName(members, item.owner_id)}
          {item.location_label ? ` · ${item.location_label}` : ''}
        </Text>
        <Text style={[s.due, { color: dueColor }]}>{closed ? statusLabel(item.type, item.status) : dueText(item.due_at)}</Text>
      </View>
      {!closed && <Text style={s.status}>{statusLabel(item.type, item.status)}{item.severity === 'kritiek' || item.severity === 'hoog' ? ` · ernst ${item.severity}` : ''}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 6,
    padding: 12,
    marginBottom: 10,
  },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  number: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: colors.text },
  bottom: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, gap: 8 },
  meta: { color: colors.muted, flex: 1, fontSize: 14 },
  due: { fontWeight: '700', fontSize: 14 },
  status: { color: colors.muted, fontSize: 13, marginTop: 4 },
});
