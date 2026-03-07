/**
 * useMeshNetwork.ts — TG-07
 *
 * React hook that manages the Bluetooth/WiFi mesh network lifecycle and
 * surfaces peer locations and messages to UI components.
 *
 * Usage:
 *   const { meshMembers, meshMessages, meshConnected, meshPeerCount,
 *           sendMeshMessage } = useMeshNetwork({ riderId, riderName });
 *
 * Integration:
 *   - `meshMembers` has the same shape as `MemberLocation` from useGroupWebSocket
 *     so it can be merged into the map pins with zero UI changes.
 *   - `meshMessages` matches `GroupMessage` from useGroupWebSocket.
 *   - When the WebSocket drops, the mesh automatically keeps group tracking alive.
 */

import { useEffect, useCallback, useRef, useState } from 'react';
import type { MemberLocation } from './useGroupWebSocket';
import type { GroupMessage } from './useGroupWebSocket';
import {
  meshStart,
  meshStop,
  meshUpdateLocation,
  meshSendGroupMessage,
  onMeshLocationUpdate,
  onMeshGroupMessage,
  onMeshStateChange,
  isMeshAvailable,
  type MeshLocationUpdate,
  type MeshGroupMessage,
} from '../services/MeshNetworkService';

export interface UseMeshNetworkOptions {
  riderId?: string;
  riderName?: string;
  /** If true, the mesh runs regardless of WebSocket connectivity. Default: true */
  alwaysOn?: boolean;
}

export interface UseMeshNetworkResult {
  /** Members discovered via the mesh (same shape as WS MemberLocation). */
  meshMembers: Map<string, MemberLocation>;
  /** Chat messages received over the mesh. */
  meshMessages: GroupMessage[];
  /** True if the mesh is running and at least one peer is connected. */
  meshConnected: boolean;
  /** Number of directly connected peers (not total mesh reach). */
  meshPeerCount: number;
  /** Names of directly connected peers. */
  meshPeerNames: string[];
  /** Whether the native mesh module is available on this platform. */
  meshAvailable: boolean;
  /** Send a message over the mesh (delivers even without internet). */
  sendMeshMessage: (text: string, preset?: string | null) => void;
  /** Push a location update into the mesh broadcast. */
  pushLocationToMesh: (lat: number, lng: number, speedMph: number, battery: number) => void;
}

const MAX_MESH_MESSAGES = 50;
// Drop stale peer locations after 30 seconds
const PEER_STALE_MS = 30_000;

export function useMeshNetwork(options?: UseMeshNetworkOptions): UseMeshNetworkResult {
  const { riderId, riderName, alwaysOn = true } = options ?? {};

  const [meshMembers, setMeshMembers] = useState<Map<string, MemberLocation>>(new Map());
  const [meshMessages, setMeshMessages] = useState<GroupMessage[]>([]);
  const [meshPeerCount, setMeshPeerCount] = useState(0);
  const [meshPeerNames, setMeshPeerNames] = useState<string[]>([]);
  const [meshRunning, setMeshRunning] = useState(false);

  const startedRef = useRef(false);
  const staleTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Start / stop mesh lifecycle ─────────────────────────────────────────

  useEffect(() => {
    if (!isMeshAvailable) return;
    if (!alwaysOn) return;

    const id   = riderId   ?? 'unknown';
    const name = riderName ?? 'Rider';

    if (!startedRef.current) {
      meshStart(id, name);
      startedRef.current = true;
    }

    return () => {
      meshStop();
      startedRef.current = false;
    };
  }, [riderId, riderName, alwaysOn]);

  // Restart if riderId/riderName changes after initial start
  useEffect(() => {
    if (!isMeshAvailable) return;
    if (!alwaysOn || !startedRef.current) return;
    if (!riderId) return;
    meshStop();
    meshStart(riderId, riderName ?? 'Rider');
  }, [riderId, riderName]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Event subscriptions ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isMeshAvailable) return;

    const unsubLocation = onMeshLocationUpdate((update: MeshLocationUpdate) => {
      const member: MemberLocation = {
        userId:    update.riderId,
        lat:       update.lat,
        lng:       update.lng,
        speed:     update.speedMph,
        battery:   update.battery,
        timestamp: new Date(update.timestamp).toISOString(),
      };
      setMeshMembers((prev) => {
        const next = new Map(prev);
        next.set(member.userId, member);
        return next;
      });
    });

    const unsubMessage = onMeshGroupMessage((msg: MeshGroupMessage) => {
      const gm: GroupMessage = {
        messageId: msg.messageId,
        riderId:   msg.riderId,
        riderName: msg.riderName,
        text:      msg.text,
        preset:    msg.preset,
        timestamp: msg.timestamp,
      };
      setMeshMessages((prev) => {
        if (prev.some((m) => m.messageId === gm.messageId)) return prev;
        const next = [...prev, gm];
        return next.length > MAX_MESH_MESSAGES ? next.slice(-MAX_MESH_MESSAGES) : next;
      });
    });

    const unsubState = onMeshStateChange((state) => {
      setMeshRunning(state.isRunning);
      setMeshPeerCount(state.peerCount);
      setMeshPeerNames(state.peerNames);
    });

    return () => {
      unsubLocation();
      unsubMessage();
      unsubState();
    };
  }, []);

  // ── Stale peer cleanup ──────────────────────────────────────────────────

  useEffect(() => {
    staleTimerRef.current = setInterval(() => {
      const cutoff = Date.now() - PEER_STALE_MS;
      setMeshMembers((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const [id, member] of next) {
          if (new Date(member.timestamp).getTime() < cutoff) {
            next.delete(id);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 10_000);

    return () => {
      if (staleTimerRef.current) clearInterval(staleTimerRef.current);
    };
  }, []);

  // ── Callbacks ────────────────────────────────────────────────────────────

  const sendMeshMessage = useCallback((text: string, preset: string | null = null) => {
    meshSendGroupMessage(text, preset);
  }, []);

  const pushLocationToMesh = useCallback(
    (lat: number, lng: number, speedMph: number, battery: number) => {
      meshUpdateLocation(lat, lng, speedMph, battery);
    },
    [],
  );

  return {
    meshMembers,
    meshMessages,
    meshConnected: meshRunning && meshPeerCount > 0,
    meshPeerCount,
    meshPeerNames,
    meshAvailable: isMeshAvailable,
    sendMeshMessage,
    pushLocationToMesh,
  };
}
