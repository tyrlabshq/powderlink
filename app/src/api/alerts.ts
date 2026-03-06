import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8420';

async function getRiderId(): Promise<string | null> {
  return AsyncStorage.getItem('riderId');
}

async function authHeaders(): Promise<Record<string, string>> {
  const riderId = await getRiderId();
  return riderId ? { 'x-rider-id': riderId } : {};
}

export interface Alert {
  id: string;
  type: string;
  riderId: string;
  groupId: string;
  location: { lat: number; lng: number } | null;
  firedAt: string;
}

/** Activate dead man's switch for the rider's current session. */
export async function setDMS(groupId: string, intervalMinutes: number): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/alerts/dms/set`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ groupId, intervalMinutes }),
  });
  if (!res.ok) throw new Error(`Failed to set DMS: ${res.status}`);
}

/** Snooze the dead man's switch for the given number of minutes. */
export async function snoozeDMS(minutes: number): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/alerts/dms/snooze`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ minutes }),
  });
  if (!res.ok) throw new Error(`Failed to snooze DMS: ${res.status}`);
}

/** Disable and remove the dead man's switch. */
export async function disableDMS(): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/alerts/dms/disable`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Failed to disable DMS: ${res.status}`);
}

/**
 * Fire a DMS alert from the app side (used when countdown expires with no response).
 * The server-side watchdog will catch it independently, but this fires it immediately.
 */
export async function fireDMSAlert(params: {
  groupId?: string;
  lat?: number;
  lng?: number;
}): Promise<void> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/alerts/fire`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Failed to fire DMS alert: ${res.status}`);
}

/** Fetch active (unacknowledged) alerts for a group. */
export async function getAlerts(groupId: string): Promise<Alert[]> {
  const headers = await authHeaders();
  const res = await fetch(`${API_BASE}/alerts/${groupId}`, { headers });
  if (!res.ok) throw new Error(`Failed to fetch alerts: ${res.status}`);
  return res.json() as Promise<Alert[]>;
}
