import { Alert, Text } from 'react-native';

import { Banner, Button, Card, colors, Muted, Screen } from '../components/ui';
import { discard, flush, useOutbox } from '../lib/outbox';

export default function Outbox() {
  const entries = useOutbox();
  return (
    <Screen>
      {entries.length === 0 ? (
        <Banner text="Alles is verzonden." tone="ok" />
      ) : (
        <>
          <Banner text={`${entries.length} item(s) wachten op verzending. Tijd en locatie zijn al vastgelegd op het moment van melden.`} tone="info" />
          <Button title="Nu verzenden" onPress={() => flush()} />
        </>
      )}
      {entries.map((e) => (
        <Card key={e.id}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: colors.text }}>
            {e.op === 'item' ? `Melding: ${e.item.title}` : e.op === 'message' ? `Bericht${e.message.body ? `: ${e.message.body}` : ''}` : 'Extra bewijs'}
          </Text>
          <Muted>
            {e.captures.length} bestand(en) · {e.attempts} poging(en)
          </Muted>
          {e.error ? <Muted style={{ color: colors.danger }}>Laatste fout: {e.error}</Muted> : null}
          {e.attempts >= 5 && (
            <Button
              small
              variant="danger"
              title="Verwijderen uit wachtrij"
              onPress={() =>
                Alert.alert('Verwijderen?', 'Dit item wordt niet meer verstuurd.', [
                  { text: 'Annuleren', style: 'cancel' },
                  { text: 'Verwijderen', style: 'destructive', onPress: () => discard(e.id) },
                ])
              }
            />
          )}
        </Card>
      ))}
    </Screen>
  );
}
