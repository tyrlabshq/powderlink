const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface RideStats {
  distanceMiles: number;
  durationSeconds: number;
  topSpeedMph: number;
  avgSpeedMph: number;
  maxAltitudeFt: number;
  elevationGainFt: number;
  elevationLossFt: number;
  route: Array<{ lat: number; lng: number }>;
  pointCount: number;
}

export interface Ride {
  rideId: string;
  groupId: string;
  groupName: string;
  name: string | null;
  startedAt: string;
  endedAt: string | null;
  stats: RideStats | null;
}

export interface ActiveRide {
  active: boolean;
  rideId?: string;
  startedAt?: string;
}

export async function startRide(groupId: string, name?: string): Promise<{ rideId: string; startedAt: string }> {
  const res = await fetch(`${API_URL}/rides/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, name }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to start ride: ${res.status}`);
  }
  return res.json();
}

export async function endRide(rideId: string): Promise<{ rideId: string; endedAt: string; stats: RideStats }> {
  const res = await fetch(`${API_URL}/rides/${rideId}/end`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? `Failed to end ride: ${res.status}`);
  }
  return res.json();
}

export async function getRide(rideId: string): Promise<Ride> {
  const res = await fetch(`${API_URL}/rides/${rideId}`);
  if (!res.ok) throw new Error(`Failed to get ride: ${res.status}`);
  return res.json();
}

export async function getRideHistory(riderId: string): Promise<Ride[]> {
  const res = await fetch(`${API_URL}/rides/history/${riderId}`);
  if (!res.ok) throw new Error(`Failed to get ride history: ${res.status}`);
  return res.json();
}

export async function getActiveRide(groupId: string): Promise<ActiveRide> {
  const res = await fetch(`${API_URL}/rides/group/${groupId}/active`);
  if (!res.ok) throw new Error(`Failed to check active ride: ${res.status}`);
  return res.json();
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
