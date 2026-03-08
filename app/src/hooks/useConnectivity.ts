/**
 * useConnectivity — TG-02: Satellite connectivity fallback
 *
 * Single source of truth for the device's current connectivity tier:
 *
 *   'online'     → WiFi or LTE available; full backend access
 *   'satellite'  → No cell/WiFi, but iPhone 14+ satellite radio active
 *   'offline'    → No connectivity at all; queue all actions
 *
 * Also exposes:
 *   - queueCount: number of pings queued for later flush
 *   - isFlushing: true while the offline queue is being replayed
 *   - flushNow(): manually trigger a queue flush
 *
 * Implementation notes:
 *   - NWPathMonitor (via NetInfo) detects cellular/WiFi loss
 *   - SatelliteService native module infers satellite from hardware + path
 *   - On reconnect (any tier), action queue is auto-flushed via OfflineQueue
 *   - Satellite tier throttles location updates (conserve satellite bandwidth)
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { SatelliteService, type SatelliteStatus } from '../services/SatelliteService';
import { OfflineQueue } from '../services/OfflineQueue';
import { LocationService } from '../services/LocationService';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ConnectivityTier = 'online' | 'satellite' | 'offline';

export interface ConnectivityState {
  /** Current connectivity tier. */
  tier: ConnectivityTier;
  /** True when device has no internet (satellite or fully offline). */
  isOffline: boolean;
  /** True when satellite radio is available as a fallback. */
  hasSatellite: boolean;
  /** Raw satellite hardware support flag. */
  satelliteSupported: boolean;
  /** Number of location pings queued for later flush. */
  queueCount: number;
  /** Number of queued actions (SOS, DMS, trail reports). */
  actionQueueLength: number;
  /** True while the action queue is being replayed. */
  isFlushing: boolean;
  /** Manually trigger an immediate queue flush. */
  flushNow: () => Promise<void>;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useConnectivity(): ConnectivityState {
  const [tier, setTier] = useState<ConnectivityTier>('online');
  const [satelliteStatus, setSatelliteStatus] = useState<SatelliteStatus>('searching');
  const [satelliteSupported, setSatelliteSupported] = useState(true);
  const [queueCount, setQueueCount] = useState(0);
  const [actionQueueLength, setActionQueueLength] = useState(0);
  const [isFlushing, setIsFlushing] = useState(false);

  const isOnlineRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Satellite status subscription ──────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    // Get initial satellite support + status
    SatelliteService.getStatus().then((result) => {
      if (!mounted) return;
      setSatelliteSupported(result.supported);
      setSatelliteStatus(result.status);
    });

    // Subscribe to real-time satellite status changes
    SatelliteService.start((event) => {
      if (!mounted) return;
      setSatelliteStatus(event.status);
      setSatelliteSupported(event.supported);
    });

    return () => {
      mounted = false;
      SatelliteService.stop();
    };
  }, []);

  // ── Derived tier ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isOnlineRef.current) {
      setTier('online');
    } else if (satelliteStatus === 'available') {
      setTier('satellite');
    } else {
      setTier('offline');
    }
  }, [satelliteStatus]);

  // ── Queue refresh ─────────────────────────────────────────────────────────
  const refreshQueues = useCallback(async (): Promise<void> => {
    const [locCount, actionLen] = await Promise.all([
      LocationService.getQueueSize(),
      OfflineQueue.getQueueLength(),
    ]);
    setQueueCount(locCount);
    setActionQueueLength(actionLen);
  }, []);

  // ── Action queue flush ────────────────────────────────────────────────────
  const flushActionQueue = useCallback(async (): Promise<void> => {
    const len = await OfflineQueue.getQueueLength();
    if (len === 0) return;
    setIsFlushing(true);
    try {
      await OfflineQueue.flush(supabase);
    } catch {
      // Non-fatal — will retry on next reconnect
    } finally {
      await refreshQueues();
      setIsFlushing(false);
    }
  }, [refreshQueues]);

  const flushNow = useCallback(async (): Promise<void> => {
    await flushActionQueue();
  }, [flushActionQueue]);

  // ── Start/stop polling when offline ──────────────────────────────────────
  const startPolling = useCallback((): void => {
    if (pollRef.current) return;
    void refreshQueues();
    pollRef.current = setInterval(() => void refreshQueues(), 5_000);
  }, [refreshQueues]);

  const stopPolling = useCallback((): void => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setQueueCount(0);
  }, []);

  // ── NetInfo subscription ──────────────────────────────────────────────────
  useEffect(() => {
    const handleNetInfo = (state: NetInfoState): void => {
      const online = state.isConnected ?? true;
      const wasOffline = !isOnlineRef.current;
      isOnlineRef.current = online;

      if (online) {
        setTier('online');
        stopPolling();
        if (wasOffline) {
          // Back online — flush queued actions
          void flushActionQueue();
          // Also flush location queue via REST
          void LocationService.flushOfflineQueue();
        }
      } else {
        // Offline — tier will be refined once satellite status is known
        startPolling();
      }
    };

    const unsubscribe = NetInfo.addEventListener(handleNetInfo);

    // Fetch initial state
    NetInfo.fetch().then((state) => {
      const online = state.isConnected ?? true;
      isOnlineRef.current = online;
      if (online) {
        setTier('online');
        void refreshQueues();
      } else {
        startPolling();
      }
    });

    return () => {
      unsubscribe();
      stopPolling();
    };
  }, [flushActionQueue, refreshQueues, startPolling, stopPolling]);

  return {
    tier,
    isOffline: tier !== 'online',
    hasSatellite: satelliteStatus === 'available',
    satelliteSupported,
    queueCount,
    actionQueueLength,
    isFlushing,
    flushNow,
  };
}
