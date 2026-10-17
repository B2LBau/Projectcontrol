import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, Field, Muted, Screen } from '../../../components/ui';
import { getRequirement } from '../../../domain/requirements';
import { formatDateTime } from '../../../report/model';
import { useStore } from '../../../storage/store';

/**
 * Intrekken met verplichte reden, van een registratie (?registrationId=…) of van de vrijgave
 * voor aanvullen (zonder registrationId). Er wordt nooit iets verwijderd.
 */
export default function Withdraw() {
  const { id, registrationId } = useLocalSearchParams<{ id: string; registrationId?: string }>();
  const { data, withdrawRegistration, revokeRelease } = useStore();
  const [reason, setReason] = useState('');
  const section = data.sections.find((s) => s.id === id);
  const registration = data.registrations.find((r) => r.id === registrationId);
  const by = data.settings.userName || 'onbekend';

  if (!section) return <Screen><Muted>Tracédeel niet gevonden.</Muted></Screen>;

  return (
    <Screen>
      <Stack.Screen options={{ title: registration ? 'Registratie intrekken' : 'Vrijgave intrekken' }} />
      <Card>
        <Text style={{ fontSize: 16 }}>
          {registration
            ? `${getRequirement(registration.checkId).title}, vastgelegd door ${registration.recordedBy} op ${formatDateTime(registration.recordedAt)}.`
            : `Vrijgave voor aanvullen van ${section.name}.`}
        </Text>
        <Muted>
          Intrekken verwijdert niets: {registration ? 'de registratie' : 'de vrijgave'} blijft met de reden zichtbaar in de
          historie en het bewijsdossier.
        </Muted>
        <Field label="Reden (verplicht)" value={reason} onChangeText={setReason} multiline />
        <Button
          title="Intrekken"
          variant="danger"
          disabled={reason.trim().length < 3}
          onPress={() => {
            if (registration) withdrawRegistration(registration.id, by, reason.trim());
            else revokeRelease(section.id, by, reason.trim());
            router.back();
          }}
        />
      </Card>
    </Screen>
  );
}
