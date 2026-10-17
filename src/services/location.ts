import * as Location from 'expo-location';

import type { GeoPoint } from '../domain/types';

/** Huidige positie voor de registratie; geeft null als GPS niet beschikbaar of geweigerd is. */
export async function currentPosition(): Promise<GeoPoint | null> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) return null;
  try {
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy ?? null };
  } catch {
    return null;
  }
}

export function formatPosition(p: GeoPoint | null): string {
  if (!p) return 'geen GPS';
  const acc = p.accuracy != null ? ` (±${Math.round(p.accuracy)} m)` : '';
  return `${p.latitude.toFixed(6)}, ${p.longitude.toFixed(6)}${acc}`;
}
