import { router, Stack } from 'expo-router';
import { useState } from 'react';

import { Button, Card, Field, Screen } from '../../components/ui';
import { useStore } from '../../storage/store';

export default function NewProject() {
  const { addProject } = useStore();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [client, setClient] = useState('');
  const [location, setLocation] = useState('');

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Nieuw project' }} />
      <Card>
        <Field label="Projectnaam" value={name} onChangeText={setName} placeholder="bijv. MS-verbinding OS Noord – RS 12" />
        <Field label="Projectnummer" value={number} onChangeText={setNumber} />
        <Field label="Opdrachtgever / netbeheerder" value={client} onChangeText={setClient} />
        <Field label="Locatie" value={location} onChangeText={setLocation} />
        <Button
          title="Project aanmaken"
          disabled={!name.trim()}
          onPress={() => {
            const p = addProject({ name: name.trim(), number: number.trim(), client: client.trim(), location: location.trim() });
            router.replace({ pathname: '/project/[id]', params: { id: p.id } });
          }}
        />
      </Card>
    </Screen>
  );
}
