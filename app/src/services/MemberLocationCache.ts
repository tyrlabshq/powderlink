/**
 * MemberLocationCache — TG-08
 *
 * Persists group member last-known locations to AsyncStorage so they are
 * available immediately on cold-start and during fully offline sessions.
 *
 * The cache is a best-effort layer: all operations are silent on error.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { MemberLocation } from '../hooks/useGroupWebSocket';

const CACHE_KEY = '@trailguard/member_locations_v1';

/** Save all current member locations to persistent storage. */
export async function saveMemberLocations(
  members: Map<string, MemberLocation>,
): Promise<void> {
  try {
    const obj: Record<string, MemberLocation> = {};
    for (const [id, loc] of members) {
      obj[id] = loc;
    }
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(obj));
  } catch {
    // Non-fatal — cache is best-effort
  }
}

/** Load previously cached member locations. Returns empty map if none exist. */
export async function loadMemberLocations(): Promise<Map<string, MemberLocation>> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, MemberLocation>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map();
  }
}

/** Clear all cached member locations (e.g. on group leave). */
export async function clearMemberLocations(): Promise<void> {
  try {
    await AsyncStorage.removeItem(CACHE_KEY);
  } catch {
    // Non-fatal
  }
}
