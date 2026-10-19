import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { router } from 'expo-router';
import { Platform } from 'react-native';

import { registerPushToken } from './api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Registreert dit toestel voor pushberichten (herinneringen, toewijzingen, chat). */
export async function registerForPush(): Promise<string | null> {
  if (Platform.OS === 'web' || !Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Meldingen en herinneringen',
      importance: AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('urgent', {
      name: 'Urgent en kritiek',
      importance: AndroidImportance.MAX,
      bypassDnd: true,
      vibrationPattern: [0, 400, 200, 400],
    });
  }
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== 'granted') return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null; // pas na `eas init` beschikbaar
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await registerPushToken(token, Platform.OS);
  return token;
}

/** Tik op een pushbericht opent de juiste melding of het juiste kanaal. */
export function listenForNotificationTaps(): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener((resp) => {
    const data = resp.notification.request.content.data as Record<string, string | undefined>;
    if (data.item_id) router.push(`/item/${data.item_id}`);
    else if (data.channel_id) router.push(`/channel/${data.channel_id}`);
    else if (data.screen === 'taken') router.push('/taken');
  });
  return () => sub.remove();
}
