import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Muted, Screen } from '../components/ui';
import { useStore } from '../storage/store';

export default function SettingsScreen() {
  const { data, updateSettings } = useStore();
  const [userName, setUserName] = useState(data.settings.userName);
  const [company, setCompany] = useState(data.settings.company);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Instellingen' }} />
      <Card>
        <Field label="Naam uitvoerder / toezichthouder" value={userName} onChangeText={setUserName} />
        <Field label="Bedrijf" value={company} onChangeText={setCompany} />
        <Muted>Je naam wordt met datum, tijd en GPS-positie bij elke registratie en vrijgave vastgelegd.</Muted>
        <Button
          title="Opslaan"
          disabled={!userName.trim()}
          onPress={() => {
            updateSettings({ userName: userName.trim(), company: company.trim() });
            router.back();
          }}
        />
      </Card>
    </Screen>
  );
}
