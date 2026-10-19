import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors } from '../components/ui';
import { AuthProvider, useAuth } from '../storage/auth';
import { StoreProvider } from '../storage/store';

function Navigator() {
  const { configured, ready, session } = useAuth();
  if (!ready) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', backgroundColor: colors.bg }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  // Zonder Supabase-koppeling werkt de app alleen lokaal en is inloggen niet nodig.
  const signedIn = !configured || !!session;
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.primaryText,
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="index" />
        <Stack.Screen name="settings" />
        <Stack.Screen name="project/new" />
        <Stack.Screen name="project/[id]/index" />
        <Stack.Screen name="project/[id]/eisen" />
        <Stack.Screen name="section/new" />
        <Stack.Screen name="section/[id]/index" />
        <Stack.Screen name="section/[id]/registratie" />
        <Stack.Screen name="section/[id]/intrekken" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StoreProvider>
          <StatusBar style="light" />
          <Navigator />
        </StoreProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}
