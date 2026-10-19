// Pushberichten via de Expo push-dienst (APNs/FCM).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0';

export type PushMessage = {
  userIds: string[];
  title: string;
  body: string;
  data?: Record<string, unknown>;
  urgent?: boolean;
};

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export async function sendPush(admin: SupabaseClient, msgs: PushMessage[]): Promise<number> {
  const userIds = [...new Set(msgs.flatMap((m) => m.userIds))];
  if (userIds.length === 0) return 0;
  const { data: tokens, error } = await admin.from('push_tokens').select('token, user_id').in('user_id', userIds);
  if (error) throw error;

  const out = msgs.flatMap((m) =>
    (tokens ?? [])
      .filter((t) => m.userIds.includes(t.user_id))
      .map((t) => ({
        to: t.token,
        title: m.title,
        body: m.body,
        data: m.data ?? {},
        sound: 'default',
        priority: m.urgent ? 'high' : 'default',
        channelId: m.urgent ? 'urgent' : 'default',
      })),
  );

  for (let i = 0; i < out.length; i += 100) {
    const res = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(out.slice(i, i + 100)),
    });
    if (!res.ok) console.error('Expo push mislukt', res.status, await res.text());
    else {
      // Verlopen tokens opruimen
      const result = await res.json();
      const batch = out.slice(i, i + 100);
      const dead = (result.data ?? [])
        .map((r: { status: string; details?: { error?: string } }, idx: number) =>
          r.status === 'error' && r.details?.error === 'DeviceNotRegistered' ? batch[idx].to : null)
        .filter(Boolean);
      if (dead.length) await admin.from('push_tokens').delete().in('token', dead);
    }
  }
  return out.length;
}

/** Eenmalig versturen: geeft false als deze sleutel al eerder verstuurd is. */
export async function claimOnce(admin: SupabaseClient, key: string): Promise<boolean> {
  const { error } = await admin.from('notification_log').insert({ key });
  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}
