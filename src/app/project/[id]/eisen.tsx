import { Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, Field, H2, Muted, Screen } from '../../../components/ui';
import { REQUIREMENTS, resolveParams } from '../../../domain/requirements';
import type { RequirementDef } from '../../../domain/types';
import { useStore } from '../../../storage/store';

function parseNumber(v: string): number | undefined {
  const n = Number(v.replace(',', '.'));
  return v.trim() !== '' && Number.isFinite(n) ? n : undefined;
}

function RequirementParams({ projectId, req }: { projectId: string; req: RequirementDef }) {
  const { data, updateProjectParams } = useStore();
  const overrides = data.projects.find((p) => p.id === projectId)?.paramOverrides[req.id];
  const current = resolveParams(req, overrides);
  const [draft, setDraft] = useState<Record<string, string>>(() =>
    Object.fromEntries(req.params.map((p) => [p.key, String(current[p.key]).replace('.', ',')])),
  );
  const [saved, setSaved] = useState(false);

  return (
    <Card>
      <H2>{req.title}</H2>
      <Muted>Bron: {req.reference}</Muted>
      {req.params.map((p) => (
        <Field
          key={p.key}
          label={`${p.label} (standaard ${String(p.default).replace('.', ',')})`}
          unit={p.unit}
          keyboardType="numbers-and-punctuation"
          value={draft[p.key] ?? ''}
          onChangeText={(v) => {
            setSaved(false);
            setDraft((d) => ({ ...d, [p.key]: v }));
          }}
        />
      ))}
      <Button
        title={saved ? 'Opgeslagen ✓' : 'Opslaan'}
        variant="secondary"
        onPress={() => {
          const params: Record<string, number> = {};
          for (const p of req.params) {
            const n = parseNumber(draft[p.key] ?? '');
            if (n !== undefined && n !== p.default) params[p.key] = n;
          }
          updateProjectParams(projectId, req.id, Object.keys(params).length ? params : undefined);
          setSaved(true);
        }}
      />
    </Card>
  );
}

export default function ProjectRequirements() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <Stack.Screen options={{ title: 'Normwaarden' }} />
      <Text style={{ fontSize: 15 }}>
        De standaardwaarden zijn gangbare uitgangspunten. Neem de waarden over uit het bestek en de specificatie van de
        netbeheerder; die zijn altijd leidend. Wijzigingen gelden voor nieuwe registraties – eerdere registraties bewaren de
        normwaarden waarmee ze getoetst zijn.
      </Text>
      {REQUIREMENTS.filter((r) => r.params.length > 0).map((r) => (
        <RequirementParams key={r.id} projectId={id} req={r} />
      ))}
    </Screen>
  );
}
