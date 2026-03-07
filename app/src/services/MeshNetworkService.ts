/**
 * MeshNetworkService.ts — TG-07
 *
 * Thin TypeScript wrapper around the native MeshNetworkModule.
 * Exposes start/stop, location updates, and event subscription helpers.
 *
 * The native module (MultipeerConnectivity) handles:
 *   • Bluetooth LE + WiFi peer discovery (no internet needed)
 *   • Auto-connect to nearby TrailGuard riders
 *   • Location relay with TTL-based mesh forwarding
 *   • Group chat relay over the mesh
 */

import { NativeModules, NativeEventEmitter, Platform } from 'react-native';

// ── Native module reference ───────────────────────────────────────────────

const { MeshNetworkModule } = NativeModules as {
  MeshNetworkModule: {
    start(riderId: string, riderName: string): void;
    stop(): void;
    updateLocation(lat: number, lng: number, speedMph: number, battery: number): void;
    sendGroupMessage(text: string, preset: string | null): void;
    getStatus(): Promise<MeshStatus>;
  } | undefined;
};

const emitter =
  Platform.OS === 'ios' && MeshNetworkModule
    ? new NativeEventEmitter(NativeModules.MeshNetworkModule)
    : null;

// ── Types ─────────────────────────────────────────────────────────────────

export interface MeshStatus {
  isRunning: boolean;
  peerCount: number;
  peerNames: string[];
}

export interface MeshLocationUpdate {
  riderId: string;
  riderName: string;
  lat: number;
  lng: number;
  speedMph: number;
  battery: number;
  timestamp: number;  // Unix ms
  source: 'mesh';
}

export interface MeshGroupMessage {
  messageId: string;
  riderId: string;
  riderName: string;
  text: string;
  preset: string | null;
  timestamp: number;  // Unix ms
  source: 'mesh';
}

export interface MeshStateChange {
  isRunning: boolean;
  peerCount: number;
  peerNames: string[];
}

// ── Service ───────────────────────────────────────────────────────────────

/** True if the native mesh module is available (iOS only). */
export const isMeshAvailable = Platform.OS === 'ios' && !!MeshNetworkModule;

/** Start advertising and browsing. Safe to call multiple times (idempotent). */
export function meshStart(riderId: string, riderName: string): void {
  if (!isMeshAvailable) return;
  MeshNetworkModule!.start(riderId, riderName);
}

/** Stop mesh — disconnects all peers. */
export function meshStop(): void {
  if (!isMeshAvailable) return;
  MeshNetworkModule!.stop();
}

/**
 * Push current location into the mesh broadcast queue.
 * Called by the location service on each GPS update.
 */
export function meshUpdateLocation(
  lat: number,
  lng: number,
  speedMph: number,
  battery: number,
): void {
  if (!isMeshAvailable) return;
  MeshNetworkModule!.updateLocation(lat, lng, speedMph, battery);
}

/** Send a group chat message over the mesh (no internet required). */
export function meshSendGroupMessage(text: string, preset: string | null = null): void {
  if (!isMeshAvailable) return;
  MeshNetworkModule!.sendGroupMessage(text, preset);
}

/** Get current mesh status. */
export async function meshGetStatus(): Promise<MeshStatus> {
  if (!isMeshAvailable) {
    return { isRunning: false, peerCount: 0, peerNames: [] };
  }
  return MeshNetworkModule!.getStatus();
}

// ── Event subscription helpers ────────────────────────────────────────────

type Unsubscribe = () => void;

export function onMeshLocationUpdate(
  cb: (update: MeshLocationUpdate) => void,
): Unsubscribe {
  if (!emitter) return () => {};
  const sub = emitter.addListener('onMeshLocationUpdate', cb);
  return () => sub.remove();
}

export function onMeshGroupMessage(
  cb: (msg: MeshGroupMessage) => void,
): Unsubscribe {
  if (!emitter) return () => {};
  const sub = emitter.addListener('onMeshGroupMessage', cb);
  return () => sub.remove();
}

export function onMeshStateChange(
  cb: (state: MeshStateChange) => void,
): Unsubscribe {
  if (!emitter) return () => {};
  const sub = emitter.addListener('onMeshStateChange', cb);
  return () => sub.remove();
}

export function onMeshPeersChanged(
  cb: (info: { peerNames: string[]; peerCount: number }) => void,
): Unsubscribe {
  if (!emitter) return () => {};
  const sub = emitter.addListener('onMeshPeersChanged', cb);
  return () => sub.remove();
}
