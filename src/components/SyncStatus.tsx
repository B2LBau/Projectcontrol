import { Text } from 'react-native';

import type { SyncStatus } from '../storage/store';
import { colors } from './ui';

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

export function syncLabel(s: SyncStatus): string {
  if (s.running) return 'Synchroniseren…';
  if (s.error) return s.pending ? `${s.pending} wijziging(en) nog niet verstuurd. ${s.error}` : s.error;
  if (s.pending) return `${s.pending} wijziging(en) wachten op verbinding`;
  if (s.lastSyncAt) return `Gesynchroniseerd om ${time(s.lastSyncAt)}`;
  return 'Nog niet gesynchroniseerd';
}

/** Eén regel met de stand van de synchronisatie; niets als de app niet gekoppeld is. */
export function SyncStatusLine({ status }: { status: SyncStatus }) {
  if (!status.enabled) return null;
  return <Text style={{ fontSize: 14, color: status.error ? colors.fail : colors.muted }}>{syncLabel(status)}</Text>;
}
