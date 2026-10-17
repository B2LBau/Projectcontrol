import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { CheckPicker } from '../../components/CheckPicker';
import { Button, Card, Field, Muted, Screen } from '../../components/ui';
import { DEFAULT_REQUIRED_CHECKS, REQUIREMENTS } from '../../domain/requirements';
import { useStore } from '../../storage/store';

/** Nieuw tracédeel (?projectId=…) of een bestaand tracédeel wijzigen (?sectionId=…). */
export default function SectionForm() {
  const { projectId, sectionId } = useLocalSearchParams<{ projectId?: string; sectionId?: string }>();
  const { data, addSection, updateSection } = useStore();
  const existing = data.sections.find((s) => s.id === sectionId);
  const count = data.sections.filter((s) => s.projectId === projectId).length;

  const [name, setName] = useState(existing?.name ?? `Tracédeel ${count + 1}`);
  const [from, setFrom] = useState(existing?.from ?? '');
  const [to, setTo] = useState(existing?.to ?? '');
  const [checks, setChecks] = useState<string[]>(existing?.requiredChecks ?? DEFAULT_REQUIRED_CHECKS);

  const save = () => {
    // Volgorde van de eisenlijst aanhouden, ongeacht de volgorde van aanvinken.
    const requiredChecks = REQUIREMENTS.map((r) => r.id).filter((id) => checks.includes(id));
    if (existing) {
      updateSection({ ...existing, name: name.trim(), from: from.trim(), to: to.trim(), requiredChecks });
      router.back();
    } else if (projectId) {
      const s = addSection({ projectId, name: name.trim(), from: from.trim(), to: to.trim(), requiredChecks });
      router.replace({ pathname: '/section/[id]', params: { id: s.id } });
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Tracédeel wijzigen' : 'Nieuw tracédeel' }} />
      <Card>
        <Field label="Naam" value={name} onChangeText={setName} />
        <Field label="Van (hectometrering / adres)" value={from} onChangeText={setFrom} placeholder="bijv. 0+000" />
        <Field label="Tot" value={to} onChangeText={setTo} placeholder="bijv. 0+050" />
      </Card>
      <Muted>Welke eisen moeten voor dit tracédeel worden aangetoond?</Muted>
      <CheckPicker selected={checks} onChange={setChecks} />
      <Button title="Opslaan" disabled={!name.trim() || checks.length === 0} onPress={save} />
    </Screen>
  );
}
