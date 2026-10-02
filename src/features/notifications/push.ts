import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';

import { supabase } from '@/lib/supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

export type PushResult = 'registered' | 'denied' | 'unavailable';

/** Asks for notification permission and stores the Expo push token. The app works fine if refused. */
export async function registerForPush(userId: string): Promise<PushResult> {
  if (!Device.isDevice) return 'unavailable';
  const current = await Notifications.getPermissionsAsync();
  const granted = current.granted || (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return 'denied';
  const projectId = (Constants.expoConfig?.extra as { easProjectId?: string } | undefined)
    ?.easProjectId;
  if (!projectId) return 'unavailable';
  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  const { error } = await supabase
    .from('push_tokens')
    .upsert({ user_id: userId, token, platform: 'ios', updated_at: new Date().toISOString() });
  return error ? 'unavailable' : 'registered';
}
