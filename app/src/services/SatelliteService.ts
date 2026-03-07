/**
 * SatelliteService — TG-06
 *
 * JavaScript interface to the native SatelliteService module (iOS Swift).
 *
 * Exposes:
 *   - Satellite availability detection (iOS 18+ API stubs, heuristic fallback)
 *   - Status events: 'available' | 'unavailable' | 'searching' | 'unsupported'
 *   - SOS routing: delegates to satellite OS flow when no cell/WiFi
 *   - Location events while on satellite path
 *
 * Usage:
 *   import { SatelliteService } from './SatelliteService';
 *   SatelliteService.start(onStatusChange);
 *   SatelliteService.fireSOS({ lat, lng });
 */

import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from 'react-native';

// ─── Types ────────────────────────────────────────────────────────────────

export type SatelliteStatus = 'available' | 'unavailable' | 'searching' | 'unsupported';

export interface SatelliteStatusEvent {
  status: SatelliteStatus;
  supported: boolean;
}

export interface SatelliteLocationEvent {
  lat: number;
  lng: number;
  altitude: number;
  accuracy: number;
  heading: number;
  speed: number;
  timestamp: number;
  signalSource: 'satellite' | 'cellular' | 'offline';
}

// ─── Native module reference ───────────────────────────────────────────────

const { SatelliteService: NativeSatelliteService } = NativeModules;

// Gracefully handle Android or simulator environments where the module is absent
const isSupported = Platform.OS === 'ios' && !!NativeSatelliteService;

const emitter = isSupported ? new NativeEventEmitter(NativeSatelliteService) : null;

// ─── Module-level state ───────────────────────────────────────────────────

let statusSubscription: EmitterSubscription | null = null;
let locationSubscription: EmitterSubscription | null = null;
let currentStatus: SatelliteStatus = 'searching';

// ─── Public API ───────────────────────────────────────────────────────────

export const SatelliteService = {
  /**
   * Start satellite monitoring.
   * @param onStatusChange  Called whenever satellite status changes.
   * @param onLocation      Optional — called on satellite-path location updates.
   */
  start(
    onStatusChange: (event: SatelliteStatusEvent) => void,
    onLocation?: (event: SatelliteLocationEvent) => void,
  ): void {
    if (!isSupported) {
      // On Android or unsupported platforms — surface unsupported immediately
      onStatusChange({ status: 'unsupported', supported: false });
      return;
    }

    // Tear down any previous subscriptions
    SatelliteService.stop();

    statusSubscription = emitter!.addListener('onSatelliteStatusChange', (event: SatelliteStatusEvent) => {
      currentStatus = event.status;
      onStatusChange(event);
    });

    if (onLocation) {
      locationSubscription = emitter!.addListener('onSatelliteLocation', onLocation);
    }

    NativeSatelliteService.startMonitoring();
  },

  /** Stop satellite monitoring and remove all listeners. */
  stop(): void {
    statusSubscription?.remove();
    statusSubscription = null;
    locationSubscription?.remove();
    locationSubscription = null;

    if (isSupported) {
      NativeSatelliteService.stopMonitoring();
    }
  },

  /**
   * Get current status as a one-shot promise.
   * Resolves to { status, supported }.
   */
  async getStatus(): Promise<SatelliteStatusEvent> {
    if (!isSupported) {
      return { status: 'unsupported', supported: false };
    }
    return NativeSatelliteService.getStatus();
  },

  /** Currently cached status (updates as events arrive). */
  getCurrentStatus(): SatelliteStatus {
    return currentStatus;
  },

  /**
   * Determine the best SOS route given current satellite state.
   * Returns 'satellite' | 'cellular' | 'offline_sms'.
   */
  getSOSRoute(): string {
    if (!isSupported) return 'cellular';
    // Synchronous native call (blocking)
    return NativeSatelliteService.preferredSOSRoute?.() ?? 'cellular';
  },

  /**
   * Fire SOS via the best available channel.
   *
   * - If satellite is available: hands off to iOS Emergency SOS satellite flow
   * - Otherwise: the JS SOSScreen handles cellular/SMS paths
   *
   * Returns the route used so the caller can supplement with JS-side actions.
   */
  async fireSOS(payload: { lat: number; lng: number }): Promise<string> {
    const route = SatelliteService.getSOSRoute();

    if (route === 'satellite' && isSupported) {
      // Hands off to iOS satellite SOS
      NativeSatelliteService.triggerEmergencySOS();
    }

    return route;
  },
};

export default SatelliteService;
