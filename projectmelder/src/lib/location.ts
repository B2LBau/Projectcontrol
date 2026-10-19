import * as Location from 'expo-location';

export type Fix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  altitude: number | null;
  heading: number | null;
  at: string;
};

let permission: boolean | null = null;

async function ensurePermission(): Promise<boolean> {
  if (permission !== null) return permission;
  const { status } = await Location.requestForegroundPermissionsAsync();
  permission = status === 'granted';
  return permission;
}

/**
 * Positie op het moment van opname/melden (FO §5.2). Geen continue tracking.
 * Geeft null als er geen toestemming of ontvangst is; de app toont dat dan bij de melding.
 */
export async function currentFix(timeoutMs = 8000): Promise<Fix | null> {
  try {
    if (!(await ensurePermission())) return null;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
      new Promise<null>((r) => setTimeout(() => r(null), timeoutMs)),
    ]);
    const p = pos ?? (await Location.getLastKnownPositionAsync());
    if (!p) return null;
    let heading: number | null = p.coords.heading ?? null;
    try {
      const h = await Promise.race([
        Location.getHeadingAsync(),
        new Promise<null>((r) => setTimeout(() => r(null), 1500)),
      ]);
      if (h && h.trueHeading >= 0) heading = h.trueHeading;
    } catch {
      // kompas niet beschikbaar (bijv. web)
    }
    return {
      lat: p.coords.latitude,
      lng: p.coords.longitude,
      accuracy: p.coords.accuracy ?? null,
      altitude: p.coords.altitude ?? null,
      heading,
      at: new Date(p.timestamp).toISOString(),
    };
  } catch {
    return null;
  }
}

/** Afstand in meters (haversine). */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export async function reverseGeocode(fix: { lat: number; lng: number }): Promise<string | null> {
  try {
    const [r] = await Location.reverseGeocodeAsync({ latitude: fix.lat, longitude: fix.lng });
    if (!r) return null;
    return [r.street && `${r.street}${r.streetNumber ? ' ' + r.streetNumber : ''}`, r.city].filter(Boolean).join(', ') || null;
  } catch {
    return null;
  }
}

export function formatFix(f: { lat: number | null; lng: number | null; accuracy?: number | null } | null): string {
  if (!f || f.lat == null || f.lng == null) return 'Locatie onbekend';
  const acc = f.accuracy != null ? ` (±${Math.round(f.accuracy)} m)` : '';
  return `${f.lat.toFixed(5)}, ${f.lng.toFixed(5)}${acc}`;
}
