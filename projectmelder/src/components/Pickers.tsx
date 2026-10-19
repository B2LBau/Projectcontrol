import { useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deadlineFromDate } from '../domain/deadlines';
import { parseDueDate } from '../domain/suggest';
import { Member, ROLE_LABELS } from '../domain/types';
import { addWorkdays, amsterdamParts } from '../domain/workdays';
import { Button, Chip, Chips, colors, Field, Label, Muted } from './ui';

export function MemberPicker({
  members,
  value,
  onChange,
  label = 'Eigenaar',
  allowNone = true,
}: {
  members: Member[];
  value: string | null;
  onChange: (id: string | null) => void;
  label?: string;
  allowNone?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const current = members.find((m) => m.user_id === value);
  const list = members.filter((m) =>
    `${m.full_name} ${m.organisation_name ?? ''} ${ROLE_LABELS[m.role]}`.toLowerCase().includes(q.toLowerCase()),
  );
  return (
    <View style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <Pressable onPress={() => setOpen(true)} style={s.select} accessibilityRole="button">
        <Text style={{ fontSize: 17, color: current ? colors.text : colors.muted }}>
          {current ? `${current.full_name} · ${ROLE_LABELS[current.role]}` : 'Niemand gekozen'}
        </Text>
        {current?.organisation_kind !== 'eigen' && current?.organisation_name ? <Muted>{current.organisation_name}</Muted> : null}
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, padding: 16, backgroundColor: colors.bg }}>
          <TextInput placeholder="Zoek op naam, rol of bedrijf" value={q} onChangeText={setQ} style={s.search} autoFocus />
          <FlatList
            data={list}
            keyExtractor={(m) => m.user_id}
            ListHeaderComponent={
              allowNone ? (
                <Pressable style={s.option} onPress={() => (onChange(null), setOpen(false))}>
                  <Text style={s.optionTitle}>Niemand</Text>
                </Pressable>
              ) : undefined
            }
            renderItem={({ item: m }) => (
              <Pressable style={[s.option, m.user_id === value && { borderColor: colors.primary }]} onPress={() => (onChange(m.user_id), setOpen(false))}>
                <Text style={s.optionTitle}>{m.full_name}</Text>
                <Muted>
                  {ROLE_LABELS[m.role]}
                  {m.organisation_name ? ` · ${m.organisation_name}` : ''}
                </Muted>
              </Pressable>
            )}
          />
          <Button title="Sluiten" variant="secondary" onPress={() => setOpen(false)} />
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const fmtDue = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : 'Geen termijn';

/** Termijn kiezen: snelkeuzes of datum typen/inspreken ("vrijdag", "12-11"). */
export function DuePicker({ value, onChange }: { value: string | null; onChange: (iso: string | null) => void }) {
  const [text, setText] = useState('');
  const today = amsterdamParts(new Date()).date;
  const quick: [string, string | null][] = [
    ['Geen', null],
    ['Vandaag', deadlineFromDate(today).toISOString()],
    ['Morgen', deadlineFromDate(addWorkdays(today, 1)).toISOString()],
    ['+2 werkdagen', deadlineFromDate(addWorkdays(today, 2)).toISOString()],
    ['+5 werkdagen', deadlineFromDate(addWorkdays(today, 5)).toISOString()],
    ['+10 werkdagen', deadlineFromDate(addWorkdays(today, 10)).toISOString()],
  ];
  return (
    <View>
      <Label>Termijn</Label>
      <Text style={{ fontSize: 16, marginBottom: 8, color: colors.text }}>{fmtDue(value)}</Text>
      <Chips>
        {quick.map(([l, v]) => (
          <Chip key={l} label={l} selected={v === value || (v === null && value === null)} onPress={() => onChange(v)} />
        ))}
      </Chips>
      <Field
        label="Of typ een datum"
        placeholder="bijv. 12-11, vrijdag, over 2 weken"
        value={text}
        onChangeText={setText}
        onSubmitEditing={() => {
          const d = parseDueDate(text, new Date());
          if (d) {
            onChange(deadlineFromDate(d).toISOString());
            setText('');
          }
        }}
        returnKeyType="done"
        hint={text && parseDueDate(text, new Date()) ? `→ ${parseDueDate(text, new Date())} (druk op enter)` : undefined}
      />
    </View>
  );
}

const s = StyleSheet.create({
  select: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    minHeight: 52,
    justifyContent: 'center',
  },
  search: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 12,
    fontSize: 17,
    marginBottom: 12,
  },
  option: {
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  optionTitle: { fontSize: 17, fontWeight: '700', color: colors.text },
});
