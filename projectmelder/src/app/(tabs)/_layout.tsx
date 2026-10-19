import { Tabs } from 'expo-router/js-tabs';
import { ColorValue, Text } from 'react-native';

import { colors } from '../../components/ui';
import { useSession } from '../../lib/session';

const icon = (glyph: string) =>
  function TabIcon({ color }: { color: ColorValue }) {
    return <Text style={{ fontSize: 22, color }}>{glyph}</Text>;
  };

export default function TabsLayout() {
  const { project } = useSession();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.primaryText,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.primary,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarLabelPosition: 'below-icon',
        tabBarStyle: { height: 68, paddingBottom: 8 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: project ? `${project.code} · Chats` : 'Chats', tabBarLabel: 'Chats', tabBarIcon: icon('💬') }} />
      <Tabs.Screen name="taken" options={{ title: 'Mijn taken', tabBarIcon: icon('✔') }} />
      <Tabs.Screen
        name="melden"
        options={{
          title: 'Melden',
          tabBarIcon: ({ focused }) => (
            <Text
              style={{
                fontSize: 26,
                color: '#fff',
                backgroundColor: focused ? colors.danger : colors.primary,
                width: 52,
                height: 52,
                lineHeight: 52,
                textAlign: 'center',
                borderRadius: 26,
                overflow: 'hidden',
                marginTop: -16,
              }}
            >
              +
            </Text>
          ),
        }}
      />
      <Tabs.Screen name="lijst" options={{ title: 'Meldingen', tabBarLabel: 'Lijst', tabBarIcon: icon('☰') }} />
      <Tabs.Screen name="meer" options={{ title: 'Meer', tabBarIcon: icon('⋯') }} />
    </Tabs>
  );
}
