import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, Loading, Screen } from '../components/ui';
import { listenForNotificationTaps, registerForPush } from '../lib/notifications';
import { SessionProvider, useSession } from '../lib/session';
import { isConfigured } from '../lib/supabase';
import NotConfigured from '../components/NotConfigured';

function Gate() {
  const { ready, session, profile, projects } = useSession();

  useEffect(() => {
    if (!session) return;
    registerForPush().catch(() => {});
    return listenForNotificationTaps();
  }, [session]);

  if (!ready) {
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  }
  const onboarded = !!profile?.full_name && projects.length > 0;

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.primaryText,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
        headerBackButtonDisplayMode: 'minimal',
      }}
    >
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" options={{ title: 'Inloggen' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && !onboarded}>
        <Stack.Screen name="onboarding" options={{ title: 'Welkom' }} />
      </Stack.Protected>
      <Stack.Protected guard={!!session && onboarded}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="channel/[id]" options={{ title: 'Chat' }} />
        <Stack.Screen name="item/[id]" options={{ title: 'Melding' }} />
        <Stack.Screen name="item/new" options={{ title: 'Nieuwe melding' }} />
        <Stack.Screen name="project/new" options={{ title: 'Nieuw project' }} />
        <Stack.Screen name="project/members" options={{ title: 'Deelnemers' }} />
        <Stack.Screen name="meeting/index" options={{ title: 'Overleggen' }} />
        <Stack.Screen name="meeting/[id]" options={{ title: 'Overleg' }} />
        <Stack.Screen name="outbox" options={{ title: 'Wachtrij' }} />
        <Stack.Screen name="profile" options={{ title: 'Profiel' }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {isConfigured ? (
        <SessionProvider>
          <Gate />
        </SessionProvider>
      ) : (
        <NotConfigured />
      )}
    </SafeAreaProvider>
  );
}
