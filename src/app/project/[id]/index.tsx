import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button, Card, H2, Muted, Row, Screen, StatusBadge } from '../../../components/ui';
import { sectionState } from '../../../domain/status';
import { exportDocx, exportPdf } from '../../../report/export';
import { useStore } from '../../../storage/store';

export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, deleteProject } = useStore();
  const [busy, setBusy] = useState(false);
  const project = data.projects.find((p) => p.id === id);
  if (!project)
    return (
      <Screen>
        <Muted>Project niet gevonden.</Muted>
      </Screen>
    );
  const sections = data.sections.filter((s) => s.projectId === project.id);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Exporteren mislukt', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: project.name }} />
      <Card>
        <Muted>{[project.number, project.client, project.location].filter(Boolean).join(' · ') || 'Geen projectgegevens'}</Muted>
        <Muted>Normset: {project.gridOperator} (uitgangspunt, nog te verifiëren met de specificatie van de netbeheerder)</Muted>
      </Card>

      <H2>Tracédelen</H2>
      {sections.length === 0 ? (
        <Muted>Deel het tracé op in stukken die je per keer open hebt liggen, bijv. per 50 m of per mofput.</Muted>
      ) : null}
      {sections.map((s) => {
        const st = sectionState(s, data.registrations);
        return (
          <Card key={s.id}>
            <Row onPress={() => router.push({ pathname: '/section/[id]', params: { id: s.id } })}>
              <View style={{ flex: 1, gap: 4 }}>
                <H2>{s.name}</H2>
                {s.from || s.to ? <Muted>{[s.from, s.to].filter(Boolean).join(' – ')}</Muted> : null}
                <Muted>
                  {st.checks.filter((c) => c.status === 'voldoet').length}/{st.checks.length} eisen aangetoond
                </Muted>
              </View>
              {s.release ? (
                <StatusBadge status="voldoet" label="Vrijgegeven" />
              ) : st.failed ? (
                <StatusBadge status="voldoet_niet" label="Afwijking" />
              ) : st.readyForBackfill ? (
                <StatusBadge status="onvolledig" label="Klaar voor vrijgave" />
              ) : (
                <StatusBadge status="ontbreekt" />
              )}
            </Row>
          </Card>
        );
      })}
      <Button
        title="+ Tracédeel toevoegen"
        onPress={() => router.push({ pathname: '/section/new', params: { projectId: project.id } })}
      />

      <H2>Bewijsdossier</H2>
      <Button title="Exporteer als PDF" disabled={busy} onPress={() => run(() => exportPdf(data, project.id))} />
      <Button title="Exporteer als Word (.docx)" disabled={busy} onPress={() => run(() => exportDocx(data, project.id))} />

      <H2>Project</H2>
      <Button
        title="Normwaarden voor dit project"
        variant="secondary"
        onPress={() => router.push({ pathname: '/project/[id]/eisen', params: { id: project.id } })}
      />
      {data.registrations.some((r) => sections.some((s) => s.id === r.sectionId)) ? (
        <Muted>Een project met registraties kan niet worden verwijderd; alle registraties blijven bewaard.</Muted>
      ) : (
        <Button
          title="Project verwijderen"
          variant="danger"
          onPress={() =>
            Alert.alert('Project verwijderen?', 'Het project en zijn (lege) tracédelen worden verwijderd.', [
              { text: 'Annuleren', style: 'cancel' },
              {
                text: 'Verwijderen',
                style: 'destructive',
                onPress: () => {
                  deleteProject(project.id);
                  router.back();
                },
              },
            ])
          }
        />
      )}
    </Screen>
  );
}
