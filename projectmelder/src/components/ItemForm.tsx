// Bevestigingskaart (FO §5.4): het voorstel (AI of lokaal) is volledig aan te passen;
// pas na "Opslaan" wordt de melding vastgelegd. Velden uit het AI-voorstel worden
// als zodanig gemarkeerd (herkomst per veld, FO NFE-12).
import { useState } from 'react';
import { Switch, Text, View } from 'react-native';

import { defaultDeadline } from '../domain/deadlines';
import type { Suggestion } from '../domain/suggest';
import { ITEM_TYPE_INFO, ITEM_TYPES, ItemType, Member, Severity, SEVERITIES, SEVERITY_LABELS, Visibility } from '../domain/types';
import { DuePicker, MemberPicker } from './Pickers';
import { Badge, Button, Card, Chip, Chips, colors, Field, Label, Muted, Row } from './ui';

export type ItemFormValue = {
  type: ItemType;
  title: string;
  description: string;
  severity: Severity;
  owner_id: string | null;
  due_at: string | null;
  location_label: string;
  visibility: Visibility;
  ai_fields: string[];
};

export function fromSuggestion(s: Suggestion): ItemFormValue {
  const ai = s.source === 'ai';
  const fields = ['type', 'title', 'description', 'severity', 'owner_id', 'due_at', 'location_label'].filter((k) =>
    k === 'owner_id' ? s.owner_id : k === 'due_at' ? s.due_at : k === 'location_label' ? s.location_label : true,
  );
  return {
    type: s.type,
    title: s.title,
    description: s.description,
    severity: s.severity,
    owner_id: s.owner_id,
    due_at: s.due_at ?? defaultDeadline(s.type, s.severity, new Date())?.toISOString() ?? null,
    location_label: s.location_label ?? '',
    visibility: 'project',
    ai_fields: ai ? fields : [],
  };
}

export function ItemForm({
  initial,
  source,
  members,
  canInternal,
  onSave,
  onDiscard,
  saving,
  index,
  total,
}: {
  initial: ItemFormValue;
  source: Suggestion['source'];
  members: Member[];
  canInternal: boolean;
  onSave: (v: ItemFormValue) => void;
  onDiscard: () => void;
  saving?: boolean;
  index: number;
  total: number;
}) {
  const [v, setV] = useState<ItemFormValue>(initial);
  const set = <K extends keyof ItemFormValue>(k: K, val: ItemFormValue[K]) =>
    setV((x) => ({ ...x, [k]: val, ai_fields: x.ai_fields.filter((f) => f !== k) }));
  const aiMark = (k: string) => (v.ai_fields.includes(k) ? ' (voorstel)' : '');

  return (
    <Card style={{ borderColor: ITEM_TYPE_INFO[v.type].color, borderWidth: 2 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={{ fontSize: 18, fontWeight: '800', color: colors.text }}>
          {total > 1 ? `Melding ${index + 1} van ${total}` : 'Controleer de melding'}
        </Text>
        <Badge label={source === 'ai' ? 'AI-voorstel' : 'Automatisch voorstel'} color={colors.primary} />
      </Row>

      <Label>Type{aiMark('type')}</Label>
      <Chips>
        {ITEM_TYPES.map((t) => (
          <Chip
            key={t}
            label={`${ITEM_TYPE_INFO[t].icon} ${ITEM_TYPE_INFO[t].label}`}
            selected={v.type === t}
            color={ITEM_TYPE_INFO[t].color}
            onPress={() => {
              set('type', t);
              if (!v.due_at) setV((x) => ({ ...x, type: t, due_at: defaultDeadline(t, x.severity, new Date())?.toISOString() ?? null }));
            }}
          />
        ))}
      </Chips>

      <Field label={`Titel${aiMark('title')}`} value={v.title} onChangeText={(t) => set('title', t)} maxLength={300} />
      <Field
        label={`Omschrijving${aiMark('description')}`}
        value={v.description}
        onChangeText={(t) => set('description', t)}
        multiline
      />

      <Label>Ernst{aiMark('severity')}</Label>
      <Chips>
        {SEVERITIES.map((s) => (
          <Chip
            key={s}
            label={SEVERITY_LABELS[s]}
            selected={v.severity === s}
            color={s === 'kritiek' ? colors.danger : s === 'hoog' ? colors.warn : colors.primary}
            onPress={() => set('severity', s)}
          />
        ))}
      </Chips>

      <MemberPicker label={`Eigenaar${aiMark('owner_id')}`} members={members} value={v.owner_id} onChange={(id) => set('owner_id', id)} />
      <DuePicker value={v.due_at} onChange={(d) => set('due_at', d)} />
      {v.ai_fields.includes('due_at') && <Muted style={{ marginTop: -6, marginBottom: 10 }}>Termijn uit de spraak herkend</Muted>}

      <Field
        label={`Locatie (projectlocatie)${aiMark('location_label')}`}
        placeholder="bijv. mofput 12, Dorpsstraat 14"
        value={v.location_label}
        onChangeText={(t) => set('location_label', t)}
        hint="De GPS-positie wordt daarnaast automatisch vastgelegd."
      />

      {canInternal && (
        <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
          <View style={{ flex: 1 }}>
            <Label>Alleen intern</Label>
            <Muted>Niet zichtbaar voor onderaannemers</Muted>
          </View>
          <Switch value={v.visibility === 'intern'} onValueChange={(on) => set('visibility', on ? 'intern' : 'project')} />
        </Row>
      )}

      {v.severity === 'kritiek' && (
        <Text style={{ color: colors.danger, fontWeight: '700', marginBottom: 8 }}>
          Kritiek: werkverantwoordelijke, uitvoerder en projectleider krijgen direct een melding.
        </Text>
      )}

      <Button title="Opslaan" variant="ok" onPress={() => onSave(v)} disabled={!v.title.trim()} busy={saving} />
      <Button title={total > 1 ? 'Deze overslaan' : 'Annuleren'} variant="secondary" onPress={onDiscard} />
    </Card>
  );
}
