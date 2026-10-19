import { router, Stack } from 'expo-router';
import { useState } from 'react';
import { Alert } from 'react-native';

import { SyncStatusLine } from '../components/SyncStatus';
import { Button, Card, Choice, Field, H2, Muted, Screen } from '../components/ui';
import { ROLES } from '../domain/roles';
import type { Role } from '../domain/types';
import { useAuth } from '../storage/auth';
import { useStore } from '../storage/store';

export default function SettingsScreen() {
  const { data, updateSettings, syncStatus, syncNow } = useStore();
  const auth = useAuth();
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
      <Card>
        <H2>Account en synchronisatie</H2>
        {auth.configured ? (
          <>
            <Muted>Ingelogd als {auth.session?.user.email}</Muted>
            <SyncStatusLine status={syncStatus} />
            <Button title="Nu synchroniseren" variant="secondary" disabled={syncStatus.running} onPress={syncNow} />
            <Button
              title="Uitloggen"
              variant="secondary"
              onPress={() => {
                const logout = () => auth.signOut().catch((e) => Alert.alert('Uitloggen mislukt', String(e)));
                if (syncStatus.pending === 0) return logout();
                Alert.alert(
                  'Nog niet alles verstuurd',
                  `${syncStatus.pending} wijziging(en) staan nog alleen op dit toestel. Ze blijven bewaard en worden verstuurd na opnieuw inloggen.`,
                  [
                    { text: 'Annuleren', style: 'cancel' },
                    { text: 'Toch uitloggen', style: 'destructive', onPress: logout },
                  ],
                );
              }}
            />
          </>
        ) : (
          <Muted>
            Deze app is niet aan een server gekoppeld: alle gegevens staan alleen op dit toestel. Maak regelmatig een
            bewijsdossier als back-up.
          </Muted>
        )}
      </Card>
    </Screen>
  );
}
