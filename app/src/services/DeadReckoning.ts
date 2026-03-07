/**
 * DeadReckoning — TG-08
 *
 * Estimates current positions of group members using their last known
 * location, speed (mph), and heading (degrees). Runs entirely offline —
 * no network, no map tiles required.
 *
 * Algorithm: spherical Earth + forward bearing projection (Haversine).
 */

import type { MemberLocation } from '../hooks/useGroupWebSocket';

// Earth radius in metres
const EARTH_RADIUS_M = 6_371_000;

/** Maximum elapsed time we'll extrapolate before giving up (5 min). */
const MAX_RECKONING_AGE_MS = 5 * 60 * 1_000;

/** Minimum speed (mph) required to project position. */
const MIN_SPEED_MPH = 2;

// ─── Geometry ────────────────────────────────────────────────────────────────

/**
 * Given a start point, bearing (°CW from N), and distance (m),
 * returns the destination using the spherical-Earth formula.
 */
function destinationPoint(
  latDeg: number,
  lngDeg: number,
  bearingDeg: number,
  distanceM: number,
): { lat: number; lng: number } {
  const d = distanceM / EARTH_RADIUS_M;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (latDeg * Math.PI) / 180;
  const lng1 = (lngDeg * Math.PI) / 180;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) +
      Math.cos(lat1) * Math.sin(d) * Math.cos(brng),
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );

  return {
    lat: (lat2 * 180) / Math.PI,
    lng: (lng2 * 180) / Math.PI,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ReckoningResult {
  lat: number;
  lng: number;
  /** True when a positional projection was actually applied. */
  isEstimated: boolean;
  /** Milliseconds since the last confirmed location update. */
  ageMs: number;
}

/**
 * Estimate the current position of a single member.
 *
 * Returns the original coordinates unchanged when:
 *  - Speed is below MIN_SPEED_MPH
 *  - Heading is missing
 *  - Last update is more than MAX_RECKONING_AGE_MS old
 */
export function reckonPosition(
  member: MemberLocation & { heading?: number | null },
): ReckoningResult {
  const ageMs = Date.now() - new Date(member.timestamp).getTime();

  const canProject =
    ageMs > 0 &&
    ageMs <= MAX_RECKONING_AGE_MS &&
    member.speed >= MIN_SPEED_MPH &&
    member.heading != null;

  if (!canProject) {
    return { lat: member.lat, lng: member.lng, isEstimated: false, ageMs };
  }

  // mph → m/s, then project
  const speedMs = member.speed * 0.44704;
  const distanceM = speedMs * (ageMs / 1_000);
  const { lat, lng } = destinationPoint(
    member.lat,
    member.lng,
    member.heading as number,
    distanceM,
  );

  return { lat, lng, isEstimated: true, ageMs };
}

/**
 * Apply dead reckoning to every member in a map.
 * Returns a new map — the input map is not mutated.
 */
export function applyDeadReckoning(
  members: Map<string, MemberLocation>,
): Map<string, MemberLocation & { isEstimated?: boolean }> {
  const out = new Map<string, MemberLocation & { isEstimated?: boolean }>();
  for (const [id, m] of members) {
    const est = reckonPosition(m as MemberLocation & { heading?: number });
    out.set(id, { ...m, lat: est.lat, lng: est.lng, isEstimated: est.isEstimated });
  }
  return out;
}
