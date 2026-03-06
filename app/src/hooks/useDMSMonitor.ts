/**
 * useDMSMonitor — PL-07
 *
 * Background movement monitor for the Dead Man's Switch feature.
 * Subscribes to BackgroundGeolocation location events and checks every 30s
 * whether the rider has moved >15 meters since the last detected movement.
 * If the rider has been stationary longer than `intervalMinutes`, fires `onAlertNeeded`.
 */

import { useEffect, useRef, useState } from 'react';
import BackgroundGeolocation, {
  Location,
  Subscription,
} from 'react-native-background-geolocation';

// ─── Constants ────────────────────────────────────────────────────────────

/** Minimum displacement (metres) that counts as "moving". */
const MOVEMENT_THRESHOLD_METERS = 15;

/** How often (ms) we run the stationary check. */
const CHECK_INTERVAL_MS = 30_000;

// ─── Haversine ────────────────────────────────────────────────────────────

/** Returns the great-circle distance in metres between two WGS-84 coords. */
function haversineMeters(
  lat1: number, lng1: number,
  lat2: number, lng2: number,
): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ─── Types ────────────────────────────────────────────────────────────────

interface Position {
  lat: number;
  lng: number;
}

export interface UseDMSMonitorResult {
  /** Timestamp of the last detected movement (>15 m displacement). */
  lastMoved: Date | null;
  /** Distance in metres from the last-moved position to the current position. */
  distanceSinceLast: number;
}

// ─── Hook ─────────────────────────────────────────────────────────────────

/**
 * @param isActive        - Whether DMS monitoring is currently active.
 * @param intervalMinutes - Alert if no movement detected within this many minutes.
 * @param onAlertNeeded   - Called when the rider has been stationary too long.
 */
export function useDMSMonitor(
  isActive: boolean,
  intervalMinutes: number,
  onAlertNeeded: () => void,
): UseDMSMonitorResult {
  const [lastMoved, setLastMoved] = useState<Date | null>(null);
  const [distanceSinceLast, setDistanceSinceLast] = useState(0);

  // Refs for values accessed inside setInterval / subscription callbacks
  const lastMovedRef = useRef<Date | null>(null);
  const lastMovedPositionRef = useRef<Position | null>(null);
  const currentPositionRef = useRef<Position | null>(null);
  const onAlertNeededRef = useRef(onAlertNeeded);
  const alertFiredRef = useRef(false);

  // Keep the callback ref fresh across re-renders without restarting the effect
  useEffect(() => {
    onAlertNeededRef.current = onAlertNeeded;
  }, [onAlertNeeded]);

  useEffect(() => {
    if (!isActive) {
      // Reset alert-fired guard so next activation starts clean
      alertFiredRef.current = false;
      return;
    }

    // Mark "now" as the start of DMS monitoring
    const startTime = new Date();
    lastMovedRef.current = startTime;
    lastMovedPositionRef.current = null;
    currentPositionRef.current = null;
    alertFiredRef.current = false;
    setLastMoved(startTime);
    setDistanceSinceLast(0);

    // ── Subscribe to location events ──────────────────────────────────────
    let subscription: Subscription | null = null;
    try {
      subscription = BackgroundGeolocation.onLocation((location: Location) => {
        const pos: Position = {
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        };
        currentPositionRef.current = pos;

        if (!lastMovedPositionRef.current) {
          // First fix — initialise baseline
          lastMovedPositionRef.current = pos;
          return;
        }

        const dist = haversineMeters(
          lastMovedPositionRef.current.lat,
          lastMovedPositionRef.current.lng,
          pos.lat,
          pos.lng,
        );

        if (dist > MOVEMENT_THRESHOLD_METERS) {
          // Rider is moving — reset the DMS timer
          const now = new Date();
          lastMovedRef.current = now;
          lastMovedPositionRef.current = pos;
          alertFiredRef.current = false;
          setLastMoved(now);
          setDistanceSinceLast(0);
        }
      });
    } catch {
      // BackgroundGeolocation may not be started yet — interval will still run
    }

    // ── Periodic stationary check ─────────────────────────────────────────
    const timer = setInterval(() => {
      if (alertFiredRef.current) return;

      const last = lastMovedRef.current;
      if (!last) return;

      // Update distance-since-last for status display
      if (lastMovedPositionRef.current && currentPositionRef.current) {
        const dist = haversineMeters(
          lastMovedPositionRef.current.lat,
          lastMovedPositionRef.current.lng,
          currentPositionRef.current.lat,
          currentPositionRef.current.lng,
        );
        setDistanceSinceLast(Math.round(dist));
      }

      const elapsedMs = Date.now() - last.getTime();
      const thresholdMs = intervalMinutes * 60_000;

      if (elapsedMs >= thresholdMs) {
        alertFiredRef.current = true;
        onAlertNeededRef.current();
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      clearInterval(timer);
      if (subscription) {
        try {
          subscription.remove();
        } catch {
          /* non-fatal */
        }
      }
    };
  }, [isActive, intervalMinutes]); // re-run if DMS is toggled or interval changes

  return { lastMoved, distanceSinceLast };
}
