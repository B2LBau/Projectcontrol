import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Choice, Field, Muted, Screen } from '../components/ui';
import { ROLES } from '../domain/roles';
import type { Role } from '../domain/types';
import { useStore } from '../storage/store';

export default function SettingsScreen() {
  const { data, updateSettings } = useStore();
  const [userName, setUserName] = useState(data.settings.userName);
  const [company, setCompany] = useState(data.settings.company);
  const [role, setRole] = useState<Role | ''>(data.settings.role);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Instellingen' }} />
      <Card>
        <Field label="Naam" value={userName} onChangeText={setUserName} />
        <Field label="Bedrijf" value={company} onChangeText={setCompany} />
        <Choice label="Rol" value={role || undefined} options={ROLES} onChange={setRole} />
        <Muted>
          Naam en rol worden met datum, tijd en GPS-positie bij elke registratie en vrijgave vastgelegd. Alleen de
          werkverantwoordelijke kan een tracédeel vrijgeven voor aanvullen.
        </Muted>
        <Button
          title="Opslaan"
          disabled={!userName.trim() || !role}
          onPress={() => {
            updateSettings({ userName: userName.trim(), company: company.trim(), role });
            router.back();
          }}
        />
      </Card>
    </Screen>
  );
}
