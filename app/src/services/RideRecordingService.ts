/**
 * RideRecordingService — TG-12
 *
 * Records GPS track points during an active ride and persists them to
 * AsyncStorage as JSON. Supports start/stop/clear and reading saved tracks.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Types ────────────────────────────────────────────────────────────────

export interface TrackPoint {
  lat: number;
  lng: number;
  altitude: number;    // metres
  speedMph: number;
  heading: number;
  timestamp: number;   // unix ms
}

export interface RecordedRide {
  rideId: string;
  startedAt: number;
  endedAt: number | null;
  points: TrackPoint[];
}

// ─── Storage keys ─────────────────────────────────────────────────────────

const ACTIVE_TRACK_KEY = '@trailguard/active_track';
const SAVED_RIDES_KEY = '@trailguard/saved_rides';

// ─── State ────────────────────────────────────────────────────────────────

let _recording = false;
let _rideId: string | null = null;
let _points: TrackPoint[] = [];

// ─── Internal helpers ─────────────────────────────────────────────────────

function generateId(): string {
  return `ride_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

async function persistActive(): Promise<void> {
  if (!_rideId) return;
  const record: RecordedRide = {
    rideId: _rideId,
    startedAt: _points[0]?.timestamp ?? Date.now(),
    endedAt: null,
    points: _points,
  };
  await AsyncStorage.setItem(ACTIVE_TRACK_KEY, JSON.stringify(record));
}

// ─── Public API ───────────────────────────────────────────────────────────

export const RideRecordingService = {
  get isRecording(): boolean {
    return _recording;
  },

  get currentRideId(): string | null {
    return _rideId;
  },

  get pointCount(): number {
    return _points.length;
  },

  /** Start recording a new ride track. */
  async start(rideId?: string): Promise<string> {
    if (_recording) {
      console.warn('[RideRecording] Already recording, ignoring start()');
      return _rideId!;
    }
    _rideId = rideId ?? generateId();
    _points = [];
    _recording = true;
    await persistActive();
    return _rideId;
  },

  /** Add a GPS point to the current recording. */
  async addPoint(point: Omit<TrackPoint, 'timestamp'>): Promise<void> {
    if (!_recording) return;
    _points.push({ ...point, timestamp: Date.now() });
    // Persist every 10 points to avoid data loss without hammering storage
    if (_points.length % 10 === 0) {
      await persistActive();
    }
  },

  /** Stop recording and save the ride to persistent history. Returns the saved ride. */
  async stop(): Promise<RecordedRide | null> {
    if (!_recording || !_rideId) return null;
    _recording = false;

    const record: RecordedRide = {
      rideId: _rideId,
      startedAt: _points[0]?.timestamp ?? Date.now(),
      endedAt: Date.now(),
      points: _points,
    };

    // Save to history
    await RideRecordingService.saveToHistory(record);

    // Clear active track
    await AsyncStorage.removeItem(ACTIVE_TRACK_KEY);
    _points = [];
    _rideId = null;
    return record;
  },

  /** Resume an interrupted recording from AsyncStorage. */
  async resumeIfActive(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(ACTIVE_TRACK_KEY);
    if (!raw) return false;
    try {
      const record: RecordedRide = JSON.parse(raw);
      _rideId = record.rideId;
      _points = record.points ?? [];
      _recording = true;
      return true;
    } catch {
      return false;
    }
  },

  /** Save a RecordedRide to permanent history (max 100 rides). */
  async saveToHistory(ride: RecordedRide): Promise<void> {
    const raw = await AsyncStorage.getItem(SAVED_RIDES_KEY);
    const existing: RecordedRide[] = raw ? JSON.parse(raw) : [];
    // Deduplicate by rideId, then prepend
    const filtered = existing.filter(r => r.rideId !== ride.rideId);
    const updated = [ride, ...filtered].slice(0, 100);
    await AsyncStorage.setItem(SAVED_RIDES_KEY, JSON.stringify(updated));
  },

  /** Load all saved ride recordings. */
  async loadHistory(): Promise<RecordedRide[]> {
    const raw = await AsyncStorage.getItem(SAVED_RIDES_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as RecordedRide[];
  },

  /** Load a single saved ride by ID. */
  async loadRide(rideId: string): Promise<RecordedRide | null> {
    const history = await RideRecordingService.loadHistory();
    return history.find(r => r.rideId === rideId) ?? null;
  },

  /** Delete a saved ride by ID. */
  async deleteRide(rideId: string): Promise<void> {
    const history = await RideRecordingService.loadHistory();
    const updated = history.filter(r => r.rideId !== rideId);
    await AsyncStorage.setItem(SAVED_RIDES_KEY, JSON.stringify(updated));
  },

  /** Compute derived stats from a set of track points. */
  computeStats(points: TrackPoint[]): {
    distanceMiles: number;
    durationSeconds: number;
    topSpeedMph: number;
    avgSpeedMph: number;
    maxAltitudeFt: number;
    elevationGainFt: number;
    elevationLossFt: number;
  } {
    if (points.length < 2) {
      return {
        distanceMiles: 0,
        durationSeconds: 0,
        topSpeedMph: 0,
        avgSpeedMph: 0,
        maxAltitudeFt: 0,
        elevationGainFt: 0,
        elevationLossFt: 0,
      };
    }

    const durationMs = points[points.length - 1].timestamp - points[0].timestamp;
    const durationSeconds = Math.round(durationMs / 1000);

    let distanceM = 0;
    let elevationGainM = 0;
    let elevationLossM = 0;
    let topSpeedMph = 0;
    let speedSum = 0;

    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];

      // Haversine distance
      distanceM += haversineMetres(prev.lat, prev.lng, curr.lat, curr.lng);

      // Elevation
      const dAlt = curr.altitude - prev.altitude;
      if (dAlt > 0) elevationGainM += dAlt;
      else elevationLossM += Math.abs(dAlt);

      // Speed
      if (curr.speedMph > topSpeedMph) topSpeedMph = curr.speedMph;
      speedSum += curr.speedMph;
    }

    const maxAltM = Math.max(...points.map(p => p.altitude));

    return {
      distanceMiles: Math.round((distanceM / 1609.34) * 100) / 100,
      durationSeconds,
      topSpeedMph: Math.round(topSpeedMph * 10) / 10,
      avgSpeedMph: Math.round((speedSum / (points.length - 1)) * 10) / 10,
      maxAltitudeFt: Math.round(maxAltM * 3.28084),
      elevationGainFt: Math.round(elevationGainM * 3.28084),
      elevationLossFt: Math.round(elevationLossM * 3.28084),
    };
  },
};

// ─── Haversine distance (metres) ──────────────────────────────────────────

function haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
