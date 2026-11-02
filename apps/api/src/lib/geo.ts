const EARTH_RADIUS_METERS = 6_371_000;

export type Coordinates = { latitude: number; longitude: number };

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Jarak dua titik di permukaan bumi (meter) dengan formula Haversine. */
export function distanceMeters(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.latitude - a.latitude);
  const dLng = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function isWithinGeofence(
  point: Coordinates,
  center: Coordinates,
  radiusMeters: number,
): boolean {
  return distanceMeters(point, center) <= Math.max(0, radiusMeters);
}

/** Validasi koordinat dari input pengguna. */
export function parseCoordinates(
  latitude: unknown,
  longitude: unknown,
): Coordinates | null {
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90) return null;
  if (lng < -180 || lng > 180) return null;

  return { latitude: lat, longitude: lng };
}
