import { Pressable, Text, View } from 'react-native';

import { REQUIREMENTS } from '../domain/requirements';
import { colors, H2, Muted } from './ui';

export function CheckPicker({ selected, onChange }: { selected: string[]; onChange: (ids: string[]) => void }) {
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((s) => s !== id) : [...selected, id]);
  return (
    <View style={{ gap: 8 }}>
      {(['grondwerk', 'elektro'] as const).map((cat) => (
        <View key={cat} style={{ gap: 8 }}>
          <H2>{cat === 'grondwerk' ? 'Civiel grondwerk' : 'Elektrotechnische montage'}</H2>
          {REQUIREMENTS.filter((r) => r.category === cat).map((r) => {
            const on = selected.includes(r.id);
            return (
              <Pressable
                key={r.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                onPress={() => toggle(r.id)}
                style={{
                  flexDirection: 'row',
                  gap: 12,
                  alignItems: 'center',
                  padding: 12,
                  minHeight: 52,
                  borderRadius: 10,
                  borderWidth: 2,
                  borderColor: on ? colors.primary : colors.border,
                  backgroundColor: colors.card,
                }}
              >
                <Text style={{ fontSize: 22, color: colors.primary, width: 24 }}>{on ? '☑' : '☐'}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>{r.title}</Text>
                  <Muted>{r.beforeBackfill ? 'Aantonen vóór aanvullen' : 'Aantonen vóór oplevering'}</Muted>
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
