import { router, Stack } from 'expo-router';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Card, colors, H2, Muted, Row, Screen, StatusBadge } from '../components/ui';
import { sectionState } from '../domain/status';
import { useStore } from '../storage/store';

export default function Projects() {
  const { ready, data } = useStore();

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Kabelcontrole 20 kV' }} />
      {!ready ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          {!data.settings.userName || !data.settings.role ? (
            <Card style={{ backgroundColor: colors.openBg }}>
              <Text style={{ fontSize: 15 }}>Vul eerst je naam en rol in. Die worden bij elke registratie vastgelegd.</Text>
              <Button title="Naar instellingen" variant="secondary" onPress={() => router.push('/settings')} />
            </Card>
          ) : null}
          <Button title="+ Nieuw project" onPress={() => router.push('/project/new')} />
          {data.projects.length === 0 ? <Muted>Nog geen projecten. Maak een project aan per kabelverbinding.</Muted> : null}
          {data.projects.map((p) => {
            const states = data.sections.filter((s) => s.projectId === p.id).map((s) => sectionState(s, data.registrations));
            const failed = states.reduce((n, s) => n + s.failed, 0);
            const open = states.reduce((n, s) => n + s.open, 0);
            return (
              <Card key={p.id}>
                <Row onPress={() => router.push({ pathname: '/project/[id]', params: { id: p.id } })}>
                  <View style={{ flex: 1, gap: 4 }}>
                    <H2>{p.name}</H2>
                    <Muted>{[p.number, p.client, p.location].filter(Boolean).join(' · ')}</Muted>
                    <Muted>{states.length} tracédeel/delen</Muted>
                  </View>
                  {failed ? (
                    <StatusBadge status="voldoet_niet" label={`${failed} afwijking`} />
                  ) : open ? (
                    <StatusBadge status="ontbreekt" label={`${open} open`} />
                  ) : states.length ? (
                    <StatusBadge status="voldoet" />
                  ) : null}
                </Row>
              </Card>
            );
          })}
          <Button title="Instellingen" variant="secondary" onPress={() => router.push('/settings')} />
        </>
      )}
    </Screen>
  );
}
