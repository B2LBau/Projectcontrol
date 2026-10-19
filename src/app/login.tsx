import { Stack } from 'expo-router';
import { useState } from 'react';
import { Text } from 'react-native';

import { Button, Card, colors, Field, Muted, Screen } from '../components/ui';
import { useAuth } from '../storage/auth';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Inloggen' }} />
      <Card>
        <Field label="E-mailadres" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
        <Field label="Wachtwoord" value={password} onChangeText={setPassword} secureTextEntry autoCapitalize="none" />
        {error ? <Text style={{ color: colors.fail, fontSize: 15 }}>{error}</Text> : null}
        <Button
          title={busy ? 'Bezig…' : 'Inloggen'}
          disabled={busy || !email.trim() || !password}
          onPress={async () => {
            setBusy(true);
            setError(null);
            try {
              await signIn(email.trim(), password);
            } catch (e) {
              setError(e instanceof Error ? e.message : 'Inloggen mislukt. Controleer de verbinding.');
            } finally {
              setBusy(false);
            }
          }}
        />
        <Muted>
          Eenmalig inloggen met internet. Daarna werkt de app ook zonder bereik; wijzigingen worden verstuurd zodra er
          weer verbinding is. Nog geen account? Vraag de beheerder.
        </Muted>
      </Card>
    </Screen>
  );
}
