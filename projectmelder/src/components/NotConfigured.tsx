import { Text } from 'react-native';

import { Card, H1, Muted, Screen } from './ui';

/** Getoond zolang de Supabase-gegevens niet in .env.local staan. */
export default function NotConfigured() {
  return (
    <Screen>
      <H1>ProjectMelder</H1>
      <Card>
        <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 8 }}>Server nog niet gekoppeld</Text>
        <Muted>
          Zet EXPO_PUBLIC_SUPABASE_URL en EXPO_PUBLIC_SUPABASE_ANON_KEY in projectmelder/.env.local (zie .env.example) en
          start de app opnieuw. Zie projectmelder/README.md voor de volledige installatie.
        </Muted>
      </Card>
    </Screen>
  );
}
