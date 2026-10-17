import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Alert, Image, Text, View } from 'react-native';

import { Button, Card, colors, H2, Muted, Row, Screen, StatusBadge } from '../../../components/ui';
import { getRequirement } from '../../../domain/requirements';
import { sectionState } from '../../../domain/status';
import { formatDateTime } from '../../../report/model';
import { formatPosition } from '../../../services/location';
import { useStore } from '../../../storage/store';

export default function SectionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, updateSection, deleteSection, deleteRegistration } = useStore();
  const section = data.sections.find((s) => s.id === id);
  if (!section) return <Screen><Muted>Tracédeel niet gevonden.</Muted></Screen>;

  const state = sectionState(section, data.registrations);
  const history = data.registrations
    .filter((r) => r.sectionId === section.id)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
  const blocking = state.checks.filter((c) => getRequirement(c.checkId).beforeBackfill && c.status !== 'voldoet');

  const release = () => {
    if (!data.settings.userName) {
      Alert.alert('Naam ontbreekt', 'Vul eerst je naam in bij Instellingen.');
      return;
    }
    Alert.alert(
      'Vrijgeven voor aanvullen?',
      `Je verklaart dat ${section.name} is gecontroleerd en aangevuld mag worden. Dit wordt vastgelegd op naam van ${data.settings.userName}.`,
      [
        { text: 'Annuleren', style: 'cancel' },
        { text: 'Vrijgeven', onPress: () => updateSection({ ...section, release: { by: data.settings.userName, at: new Date().toISOString() } }) },
      ],
    );
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: section.name }} />
      {section.from || section.to ? <Muted>{[section.from, section.to].filter(Boolean).join(' – ')}</Muted> : null}

      <Card
        style={{
          backgroundColor: section.release ? colors.okBg : state.readyForBackfill ? colors.openBg : colors.card,
        }}
      >
        <H2>Aanvullen sleuf</H2>
        {section.release ? (
          <>
            <Text style={{ fontSize: 16 }}>
              Vrijgegeven door {section.release.by} op {formatDateTime(section.release.at)}.
            </Text>
            {!state.readyForBackfill ? (
              <Text style={{ fontSize: 15, color: colors.fail, fontWeight: '600' }}>
                Let op: na de vrijgave is een eis niet (meer) aangetoond. Controleer de registraties.
              </Text>
            ) : null}
          </>
        ) : state.readyForBackfill ? (
          <>
            <Text style={{ fontSize: 16 }}>Alle eisen vóór aanvullen zijn aangetoond. De sleuf kan worden vrijgegeven.</Text>
            <Button title="Vrijgeven voor aanvullen" onPress={release} />
          </>
        ) : (
          <Text style={{ fontSize: 16 }}>
            Nog niet aanvullen. Eerst aantonen: {blocking.map((c) => getRequirement(c.checkId).title).join(', ')}.
          </Text>
        )}
      </Card>

      <H2>Eisen</H2>
      {state.checks.map((c) => {
        const req = getRequirement(c.checkId);
        return (
          <Card key={c.checkId}>
            <Row onPress={() => router.push({ pathname: '/section/[id]/registratie', params: { id: section.id, checkId: c.checkId } })}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontSize: 17, fontWeight: '700', color: colors.text }}>{req.title}</Text>
                <Muted>
                  {c.latest
                    ? `${formatDateTime(c.latest.recordedAt)} · ${c.latest.recordedBy}`
                    : req.beforeBackfill
                      ? 'Aantonen vóór aanvullen'
                      : 'Aantonen vóór oplevering'}
                </Muted>
              </View>
              <StatusBadge status={c.status} />
            </Row>
            {c.status === 'voldoet_niet' ? (
              <Text style={{ color: colors.fail, fontSize: 14 }}>Herstel de afwijking en registreer de eis opnieuw.</Text>
            ) : null}
          </Card>
        );
      })}

      <H2>Registraties</H2>
      {history.length === 0 ? <Muted>Nog geen registraties.</Muted> : null}
      {history.map((r) => (
        <Card key={r.id}>
          <Row>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: '700' }}>{getRequirement(r.checkId).title}</Text>
            <StatusBadge status={r.evaluation.status} />
          </Row>
          <Muted>
            {formatDateTime(r.recordedAt)} · {r.recordedBy} · {formatPosition(r.location)}
          </Muted>
          {r.evaluation.details.map((d, i) => (
            <Text key={i} style={{ fontSize: 14 }}>
              {d}
            </Text>
          ))}
          {r.remark ? <Text style={{ fontSize: 14, fontStyle: 'italic' }}>{r.remark}</Text> : null}
          {r.photos.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {r.photos.map((uri) => (
                <Image key={uri} source={{ uri }} style={{ width: 96, height: 96, borderRadius: 6 }} />
              ))}
            </View>
          ) : null}
          <Button
            title="Verwijderen"
            variant="secondary"
            onPress={() =>
              Alert.alert('Registratie verwijderen?', 'De registratie en foto’s worden definitief verwijderd.', [
                { text: 'Annuleren', style: 'cancel' },
                { text: 'Verwijderen', style: 'destructive', onPress: () => deleteRegistration(r.id) },
              ])
            }
          />
        </Card>
      ))}

      <H2>Tracédeel</H2>
      <Button
        title="Gegevens en eisen wijzigen"
        variant="secondary"
        onPress={() => router.push({ pathname: '/section/new', params: { sectionId: section.id, projectId: section.projectId } })}
      />
      {section.release ? (
        <Button title="Vrijgave intrekken" variant="secondary" onPress={() => updateSection({ ...section, release: undefined })} />
      ) : null}
      <Button
        title="Tracédeel verwijderen"
        variant="danger"
        onPress={() =>
          Alert.alert('Tracédeel verwijderen?', 'Alle registraties en foto’s van dit tracédeel worden verwijderd.', [
            { text: 'Annuleren', style: 'cancel' },
            {
              text: 'Verwijderen',
              style: 'destructive',
              onPress: () => {
                deleteSection(section.id);
                router.back();
              },
            },
          ])
        }
      />
    </Screen>
  );
}
