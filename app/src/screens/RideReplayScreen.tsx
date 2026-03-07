/**
 * RideReplayScreen — TG-12
 *
 * Animated ride replay on a Mapbox map with:
 *  - Progressive polyline build-up as replay advances
 *  - 3D camera flyover (pitch + animated heading)
 *  - Speed / elevation / distance HUD overlay
 *  - Share screenshot of the full route
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import MapboxGL from '@rnmapbox/maps';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../theme/colors';
import { RideRecordingService, type RecordedRide, type TrackPoint } from '../services/RideRecordingService';
import { formatDuration } from '../api/rides';
import type { ProfileStackParamList } from '../navigation/AppNavigator';

// ─── Types ────────────────────────────────────────────────────────────────

type ReplayRoute = RouteProp<ProfileStackParamList, 'RideReplay'>;
type Nav = StackNavigationProp<ProfileStackParamList, 'RideReplay'>;

// ─── Constants ────────────────────────────────────────────────────────────

const REPLAY_INTERVAL_MS = 80;   // ms between steps
const FLYOVER_ALTITUDE = 400;    // metres above ground
const FLYOVER_PITCH = 55;        // degrees (3D tilt)
const MIN_SPEED_STEPS = 2;       // skip fewer than this many points
const { width: SCREEN_W } = Dimensions.get('window');

// ─── Helpers ──────────────────────────────────────────────────────────────

function bearingBetween(p1: TrackPoint, p2: TrackPoint): number {
  const dLng = toRad(p2.lng - p1.lng);
  const lat1 = toRad(p1.lat);
  const lat2 = toRad(p2.lat);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function toRad(d: number) { return (d * Math.PI) / 180; }

function metresToFt(m: number) { return Math.round(m * 3.28084); }

function pointsToGeoJSON(points: TrackPoint[]): GeoJSON.Feature<GeoJSON.LineString> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      coordinates: points.map(p => [p.lng, p.lat, p.altitude]),
    },
  };
}

// ─── Stats HUD ────────────────────────────────────────────────────────────

function StatsHUD({
  speed,
  altitudeFt,
  distanceMiles,
  elapsed,
  progress,
}: {
  speed: number;
  altitudeFt: number;
  distanceMiles: number;
  elapsed: number;
  progress: number;
}) {
  return (
    <View style={styles.hud}>
      <View style={styles.hudRow}>
        <HUDStat label="Speed" value={`${speed.toFixed(1)}`} unit="mph" />
        <HUDStat label="Altitude" value={`${altitudeFt.toLocaleString()}`} unit="ft" />
        <HUDStat label="Distance" value={`${distanceMiles.toFixed(2)}`} unit="mi" />
        <HUDStat label="Elapsed" value={formatDuration(elapsed)} />
      </View>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
      </View>
    </View>
  );
}

function HUDStat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <View style={styles.hudStat}>
      <Text style={styles.hudValue}>
        {value}
        {unit ? <Text style={styles.hudUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.hudLabel}>{label}</Text>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────

export default function RideReplayScreen() {
  const route = useRoute<ReplayRoute>();
  const navigation = useNavigation<Nav>();
  const { rideId, ride: rideProp } = route.params;

  const [ride, setRide] = useState<RecordedRide | null>(rideProp ?? null);
  const [loading, setLoading] = useState(!rideProp);

  // Replay state
  const [playing, setPlaying] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [flyoverMode, setFlyoverMode] = useState(false);

  // Derived live stats
  const [liveSpeed, setLiveSpeed] = useState(0);
  const [liveAltFt, setLiveAltFt] = useState(0);
  const [liveDistMiles, setLiveDistMiles] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState(0);

  const cameraRef = useRef<MapboxGL.Camera>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stepRef = useRef(0);
  const distAccRef = useRef(0);   // accumulated distance in metres

  // ── Load ride if only ID provided ──────────────────────────────────────

  useEffect(() => {
    if (rideProp) { setLoading(false); return; }
    const loader = rideId === '__latest__'
      ? RideRecordingService.loadHistory().then(h => h[0] ?? null)
      : RideRecordingService.loadRide(rideId);
    loader.then(r => {
      setRide(r);
      setLoading(false);
    });
  }, [rideId, rideProp]);

  // ── Build visible polyline (subset of points up to current step) ───────

  const visiblePoints = ride ? ride.points.slice(0, stepIndex + 1) : [];
  const visibleGeoJSON = visiblePoints.length >= 2 ? pointsToGeoJSON(visiblePoints) : null;

  // Full route (dimmed ghost)
  const fullGeoJSON = ride && ride.points.length >= 2 ? pointsToGeoJSON(ride.points) : null;

  // ── Replay tick ─────────────────────────────────────────────────────────

  const tick = useCallback(() => {
    if (!ride) return;
    const points = ride.points;
    const next = stepRef.current + 1;

    if (next >= points.length) {
      // Done
      clearInterval(timerRef.current!);
      setPlaying(false);
      return;
    }

    const prev = points[stepRef.current];
    const curr = points[next];

    stepRef.current = next;
    setStepIndex(next);

    // Accumulate distance
    const { haversineMetres } = _geo;
    distAccRef.current += haversineMetres(prev.lat, prev.lng, curr.lat, curr.lng);

    setLiveSpeed(curr.speedMph);
    setLiveAltFt(metresToFt(curr.altitude));
    setLiveDistMiles(Math.round((distAccRef.current / 1609.34) * 1000) / 1000);

    const elapsedSec = Math.round((curr.timestamp - points[0].timestamp) / 1000);
    setLiveElapsed(elapsedSec);

    // Move camera
    if (cameraRef.current) {
      const bearing = next < points.length - 1
        ? bearingBetween(curr, points[next + 1])
        : bearingBetween(prev, curr);

      if (flyoverMode) {
        cameraRef.current.setCamera({
          centerCoordinate: [curr.lng, curr.lat],
          zoomLevel: 16,
          heading: bearing,
          pitch: FLYOVER_PITCH,
          altitude: FLYOVER_ALTITUDE,
          animationDuration: REPLAY_INTERVAL_MS * 2,
          animationMode: 'easeTo',
        });
      } else {
        cameraRef.current.setCamera({
          centerCoordinate: [curr.lng, curr.lat],
          zoomLevel: 15,
          heading: bearing,
          pitch: 20,
          animationDuration: REPLAY_INTERVAL_MS,
          animationMode: 'easeTo',
        });
      }
    }
  }, [ride, flyoverMode]);

  // ── Play / pause ────────────────────────────────────────────────────────

  function togglePlay() {
    if (!ride || ride.points.length < 2) return;

    if (playing) {
      clearInterval(timerRef.current!);
      setPlaying(false);
    } else {
      // If at end, restart
      if (stepRef.current >= ride.points.length - 1) {
        stepRef.current = 0;
        distAccRef.current = 0;
        setStepIndex(0);
      }
      setPlaying(true);
      timerRef.current = setInterval(tick, REPLAY_INTERVAL_MS);
    }
  }

  // Keep tick up-to-date when flyoverMode changes without restarting
  useEffect(() => {
    if (playing) {
      clearInterval(timerRef.current!);
      timerRef.current = setInterval(tick, REPLAY_INTERVAL_MS);
    }
  }, [tick, flyoverMode]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { clearInterval(timerRef.current!); };
  }, []);

  // ── Share ───────────────────────────────────────────────────────────────

  async function handleShare() {
    if (!ride) return;
    const stats = RideRecordingService.computeStats(ride.points);
    const text =
      `🏔 TrailGuard Ride Replay\n` +
      `📏 ${stats.distanceMiles} mi  ⏱ ${formatDuration(stats.durationSeconds)}\n` +
      `⚡ Top Speed: ${stats.topSpeedMph} mph  📊 Avg: ${stats.avgSpeedMph} mph\n` +
      `↑ Gain: ${stats.elevationGainFt} ft  🏔 Max Alt: ${stats.maxAltitudeFt.toLocaleString()} ft\n\n` +
      `Tracked with TrailGuard 🛡`;
    try {
      await Share.share({ message: text, title: 'TrailGuard Ride' });
    } catch {
      Alert.alert('Share failed', 'Could not share ride.');
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} size="large" />
      </View>
    );
  }

  if (!ride || ride.points.length < 2) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>No GPS data available for this ride.</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.backBtnText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const progress = ride.points.length > 1 ? stepIndex / (ride.points.length - 1) : 0;
  const firstPt = ride.points[0];

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapboxGL.MapView style={styles.map} styleURL="mapbox://styles/mapbox/outdoors-v12" logoEnabled={false}>
        <MapboxGL.Camera
          ref={cameraRef}
          centerCoordinate={[firstPt.lng, firstPt.lat]}
          zoomLevel={14}
          pitch={flyoverMode ? FLYOVER_PITCH : 20}
          animationMode="flyTo"
          animationDuration={1000}
        />

        {/* Ghost full route */}
        {fullGeoJSON && (
          <MapboxGL.ShapeSource id="full-route" shape={fullGeoJSON}>
            <MapboxGL.LineLayer
              id="full-route-line"
              style={{ lineColor: '#334455', lineWidth: 3, lineOpacity: 0.5 }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Animated replay polyline */}
        {visibleGeoJSON && (
          <MapboxGL.ShapeSource id="replay-route" shape={visibleGeoJSON}>
            <MapboxGL.LineLayer
              id="replay-route-line"
              style={{
                lineColor: colors.accent,
                lineWidth: 4,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          </MapboxGL.ShapeSource>
        )}

        {/* Current position marker */}
        {stepIndex < ride.points.length && (
          <MapboxGL.PointAnnotation
            id="current-pos"
            coordinate={[ride.points[stepIndex].lng, ride.points[stepIndex].lat]}
          >
            <View style={styles.dot} />
          </MapboxGL.PointAnnotation>
        )}

        {/* Start marker */}
        <MapboxGL.PointAnnotation id="start-pos" coordinate={[firstPt.lng, firstPt.lat]}>
          <View style={styles.startDot} />
        </MapboxGL.PointAnnotation>
      </MapboxGL.MapView>

      {/* Stats HUD */}
      <StatsHUD
        speed={liveSpeed}
        altitudeFt={liveAltFt}
        distanceMiles={liveDistMiles}
        elapsed={liveElapsed}
        progress={progress}
      />

      {/* Controls */}
      <View style={styles.controls}>
        <TouchableOpacity style={styles.controlBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.controlBtnText}>✕</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.playBtn, playing && styles.playBtnActive]} onPress={togglePlay}>
          <Text style={styles.playBtnText}>{playing ? '⏸' : '▶'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.controlBtn, flyoverMode && styles.controlBtnActive]}
          onPress={() => setFlyoverMode(v => !v)}
        >
          <Text style={styles.controlBtnText}>3D</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.controlBtn} onPress={handleShare}>
          <Text style={styles.controlBtnText}>⬆</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Geo helper (inline to avoid circular dep) ────────────────────────────

const _geo = {
  haversineMetres(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  },
};

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  map: { flex: 1 },

  // Stats HUD
  hud: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(8,12,20,0.85)',
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  hudRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 8 },
  hudStat: { alignItems: 'center' },
  hudValue: { color: colors.accent, fontSize: 18, fontWeight: '700' },
  hudUnit: { color: colors.textDim, fontSize: 12, fontWeight: '400' },
  hudLabel: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  progressBar: {
    height: 3,
    backgroundColor: colors.surface,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 3, backgroundColor: colors.accent, borderRadius: 2 },

  // Controls
  controls: {
    position: 'absolute',
    bottom: 32,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 24,
  },
  controlBtn: {
    backgroundColor: 'rgba(13,21,32,0.9)',
    borderRadius: 28,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  controlBtnActive: { borderColor: colors.accent },
  controlBtnText: { color: colors.text, fontSize: 18, fontWeight: '600' },

  playBtn: {
    backgroundColor: colors.accent,
    borderRadius: 36,
    width: 64,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnActive: { backgroundColor: '#007fcc' },
  playBtnText: { color: '#fff', fontSize: 26 },

  // Map markers
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.accent,
    borderWidth: 2,
    borderColor: '#fff',
  },
  startDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.success,
    borderWidth: 2,
    borderColor: '#fff',
  },

  // Error / back
  errorText: { color: colors.textDim, fontSize: 15, textAlign: 'center', marginBottom: 24 },
  backBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  backBtnText: { color: colors.text, fontSize: 15 },
});
