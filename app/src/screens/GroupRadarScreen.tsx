/**
 * GroupRadarScreen — TG-09
 *
 * Radar-style group finder showing bearing and distance to each group member.
 * Works fully offline via mesh or last-known GPS — no network required.
 *
 * Features:
 *   • Animated radar sweep (green arc rotating continuously)
 *   • Blips for each group member at correct bearing + scaled distance
 *   • Distance (mi/ft) and bearing label per blip
 *   • Audio/haptic beacon mode — vibration pulses when a member is within 100m
 *   • Works from mesh peer locations or last-known GPS cache
 */

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Easing,
  Vibration,
  Switch,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Svg, {
  Circle,
  Line,
  G,
  Text as SvgText,
  Defs,
  RadialGradient,
  Stop,
  Path,
} from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useMeshNetwork } from '../hooks/useMeshNetwork';
import { colors } from '../theme/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const SCREEN = Dimensions.get('window');
const RADAR_SIZE = Math.min(SCREEN.width - 32, 320);
const RADAR_R = RADAR_SIZE / 2;          // outer radius
const RINGS = 3;                          // concentric rings
/** Max real-world distance mapped to radar edge (metres). */
const MAX_RANGE_M = 5000;
/** Within this many metres → trigger proximity beacon. */
const BEACON_THRESHOLD_M = 100;
const SWEEP_DURATION_MS = 2500;          // one full rotation

// ─── Geo helpers ─────────────────────────────────────────────────────────────

/** Haversine distance in metres between two lat/lon pairs. */
function haversineMetres(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** True bearing (0–360°) from point A to point B. */
function bearingDeg(
  lat1: number, lon1: number,
  lat2: number, lon2: number,
): number {
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const la1 = (lat1 * Math.PI) / 180;
  const la2 = (lat2 * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x =
    Math.cos(la1) * Math.sin(la2) -
    Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function formatDistance(metres: number): string {
  if (metres < 1000) return `${Math.round(metres)}m`;
  return `${(metres / 1000).toFixed(1)}km`;
}

function cardinalDir(deg: number): string {
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  return dirs[Math.round(deg / 45) % 8];
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MyLocation {
  lat: number;
  lng: number;
  timestamp: number;
}

interface RadarBlip {
  riderId: string;
  riderName: string;
  lat: number;
  lng: number;
  /** Bearing in degrees relative to north (0–360). */
  bearingDeg: number;
  /** Distance in metres. */
  distanceM: number;
  /** Normalised distance [0..1] mapped to radar radius. */
  normDist: number;
  /** Polar → Cartesian: x offset from centre (-RADAR_R..RADAR_R). */
  cx: number;
  /** Polar → Cartesian: y offset from centre (-RADAR_R..RADAR_R). */
  cy: number;
}

// ─── Radar sweep arc ──────────────────────────────────────────────────────────

function sweepPath(angleDeg: number, r: number): string {
  // Draw a 60° filled wedge centred on angleDeg
  const span = 60;
  const a1 = ((angleDeg - span / 2) * Math.PI) / 180;
  const a2 = ((angleDeg + span / 2) * Math.PI) / 180;
  const x1 = r + r * Math.sin(a1);
  const y1 = r - r * Math.cos(a1);
  const x2 = r + r * Math.sin(a2);
  const y2 = r - r * Math.cos(a2);
  return `M ${r} ${r} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z`;
}

// ─── Component ────────────────────────────────────────────────────────────────

const LOCATION_CACHE_KEY = '@trailguard/myLocation';

export default function GroupRadarScreen() {
  // ── Location ──────────────────────────────────────────────────────────────
  const [myLocation, setMyLocation] = useState<MyLocation | null>(null);

  // Load cached location on mount (works offline)
  useEffect(() => {
    AsyncStorage.getItem(LOCATION_CACHE_KEY).then((raw) => {
      if (raw) {
        try {
          setMyLocation(JSON.parse(raw));
        } catch { /* ignore */ }
      }
    });
  }, []);

  // Try live GPS via react-native-background-geolocation if available
  useEffect(() => {
    let cancelled = false;
    try {
      // Dynamic import so the screen doesn't crash if the module is missing
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const BG = require('react-native-background-geolocation').default;
      BG.getCurrentPosition(
        { timeout: 10, maximumAge: 30, desiredAccuracy: 10, persist: false },
        (location: { coords: { latitude: number; longitude: number } }) => {
          if (cancelled) return;
          const loc: MyLocation = {
            lat: location.coords.latitude,
            lng: location.coords.longitude,
            timestamp: Date.now(),
          };
          setMyLocation(loc);
          AsyncStorage.setItem(LOCATION_CACHE_KEY, JSON.stringify(loc));
        },
        () => { /* fallback to cache — already loaded above */ },
      );
    } catch { /* module unavailable */ }
    return () => { cancelled = true; };
  }, []);

  // ── Mesh peers ────────────────────────────────────────────────────────────
  const { meshMembers } = useMeshNetwork({
    riderId: undefined,
    riderName: undefined,
    alwaysOn: true,
  });

  // ── Sweep animation ───────────────────────────────────────────────────────
  const sweepAngle = useRef(new Animated.Value(0)).current;
  const [sweepDeg, setSweepDeg] = useState(0);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(sweepAngle, {
        toValue: 360,
        duration: SWEEP_DURATION_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    const id = sweepAngle.addListener(({ value }) => setSweepDeg(value));
    anim.start();
    return () => {
      anim.stop();
      sweepAngle.removeListener(id);
    };
  }, [sweepAngle]);

  // ── Blips ─────────────────────────────────────────────────────────────────
  const blips: RadarBlip[] = useMemo(() => {
    if (!myLocation) return [];
    const result: RadarBlip[] = [];
    meshMembers.forEach((member, riderId) => {
      const distM = haversineMetres(myLocation.lat, myLocation.lng, member.lat, member.lng);
      const bearing = bearingDeg(myLocation.lat, myLocation.lng, member.lat, member.lng);
      // Cap distance at MAX_RANGE_M; clamp normalised distance to [0.05, 0.95]
      const normDist = Math.min(distM / MAX_RANGE_M, 1) * 0.9 + 0.05;
      const angleRad = (bearing * Math.PI) / 180;
      const plotR = normDist * RADAR_R;
      result.push({
        riderId,
        riderName: (member as any).riderName ?? riderId.slice(0, 6),
        lat: member.lat,
        lng: member.lng,
        bearingDeg: bearing,
        distanceM: distM,
        normDist,
        cx: RADAR_R + plotR * Math.sin(angleRad),
        cy: RADAR_R - plotR * Math.cos(angleRad),
      });
    });
    return result;
  }, [myLocation, meshMembers]);

  // ── Proximity beacon ──────────────────────────────────────────────────────
  const [beaconEnabled, setBeaconEnabled] = useState(false);
  const beaconTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nearestM = useMemo(
    () => blips.reduce((min, b) => Math.min(min, b.distanceM), Infinity),
    [blips],
  );

  const scheduleBeep = useCallback(() => {
    if (beaconTimerRef.current) return;
    // Pulse interval scales with distance: 200ms at 0m → 2000ms at threshold
    const clamped = Math.min(nearestM, BEACON_THRESHOLD_M);
    const intervalMs = 200 + (clamped / BEACON_THRESHOLD_M) * 1800;
    Vibration.vibrate(80);
    beaconTimerRef.current = setTimeout(() => {
      beaconTimerRef.current = null;
      if (beaconEnabled && nearestM <= BEACON_THRESHOLD_M) scheduleBeep();
    }, intervalMs);
  }, [beaconEnabled, nearestM]);

  useEffect(() => {
    if (beaconEnabled && nearestM <= BEACON_THRESHOLD_M) {
      scheduleBeep();
    } else {
      if (beaconTimerRef.current) {
        clearTimeout(beaconTimerRef.current);
        beaconTimerRef.current = null;
      }
    }
    return () => {
      if (beaconTimerRef.current) clearTimeout(beaconTimerRef.current);
    };
  }, [beaconEnabled, nearestM, scheduleBeep]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const size = RADAR_SIZE;
  const r = RADAR_R;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <Text style={styles.title}>Group Radar</Text>
      <Text style={styles.subtitle}>
        {myLocation
          ? `Your position known · ${blips.length} member${blips.length !== 1 ? 's' : ''} visible`
          : 'Acquiring GPS…'}
      </Text>

      {/* Radar canvas */}
      <View style={styles.radarWrap}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id="sweepGrad" cx="50%" cy="50%" r="50%">
              <Stop offset="0%" stopColor={colors.success} stopOpacity={0.3} />
              <Stop offset="100%" stopColor={colors.success} stopOpacity={0} />
            </RadialGradient>
          </Defs>

          {/* Background circle */}
          <Circle cx={r} cy={r} r={r - 1} fill="#020a04" stroke={colors.success} strokeWidth={1.5} strokeOpacity={0.4} />

          {/* Concentric rings */}
          {Array.from({ length: RINGS }).map((_, i) => (
            <Circle
              key={i}
              cx={r}
              cy={r}
              r={((i + 1) / (RINGS + 1)) * r}
              fill="none"
              stroke={colors.success}
              strokeWidth={0.5}
              strokeOpacity={0.2}
            />
          ))}

          {/* Cross-hair lines */}
          <Line x1={r} y1={0} x2={r} y2={size} stroke={colors.success} strokeWidth={0.5} strokeOpacity={0.2} />
          <Line x1={0} y1={r} x2={size} y2={r} stroke={colors.success} strokeWidth={0.5} strokeOpacity={0.2} />

          {/* Cardinal labels */}
          {(['N','E','S','W'] as const).map((dir, i) => {
            const ox = [0, 1, 0, -1][i] * (r - 16);
            const oy = [-1, 0, 1, 0][i] * (r - 16);
            return (
              <SvgText
                key={dir}
                x={r + ox}
                y={r + oy + 4}
                textAnchor="middle"
                fill={colors.success}
                fontSize={11}
                opacity={0.5}
                fontWeight="700"
              >
                {dir}
              </SvgText>
            );
          })}

          {/* Sweep wedge */}
          <Path
            d={sweepPath(sweepDeg, r)}
            fill={colors.success}
            opacity={0.08}
          />
          {/* Sweep leading edge */}
          <Line
            x1={r}
            y1={r}
            x2={r + r * Math.sin((sweepDeg * Math.PI) / 180)}
            y2={r - r * Math.cos((sweepDeg * Math.PI) / 180)}
            stroke={colors.success}
            strokeWidth={1.5}
            strokeOpacity={0.7}
          />

          {/* Blips */}
          {blips.map((blip) => {
            // Check if sweep recently "hit" this blip for a glow effect
            const angleDiff = ((sweepDeg - blip.bearingDeg + 360) % 360);
            const justScanned = angleDiff < 30; // trailing 30° after sweep
            return (
              <G key={blip.riderId}>
                {/* Glow */}
                {justScanned && (
                  <Circle
                    cx={blip.cx}
                    cy={blip.cy}
                    r={10}
                    fill={colors.success}
                    opacity={0.15 * (1 - angleDiff / 30)}
                  />
                )}
                {/* Core blip */}
                <Circle
                  cx={blip.cx}
                  cy={blip.cy}
                  r={4}
                  fill={colors.success}
                  opacity={justScanned ? 1 : 0.5}
                />
                {/* Label */}
                <SvgText
                  x={blip.cx + 8}
                  y={blip.cy - 6}
                  fill={colors.success}
                  fontSize={9}
                  opacity={0.8}
                >
                  {blip.riderName}
                </SvgText>
                <SvgText
                  x={blip.cx + 8}
                  y={blip.cy + 4}
                  fill={colors.success}
                  fontSize={9}
                  opacity={0.6}
                >
                  {formatDistance(blip.distanceM)}
                </SvgText>
              </G>
            );
          })}

          {/* Self dot */}
          <Circle cx={r} cy={r} r={5} fill={colors.accent} />
          <Circle cx={r} cy={r} r={9} fill="none" stroke={colors.accent} strokeWidth={1} strokeOpacity={0.4} />
        </Svg>

        {/* Range label */}
        <Text style={styles.rangeLabel}>Edge = {formatDistance(MAX_RANGE_M)}</Text>
      </View>

      {/* Proximity beacon toggle */}
      <View style={styles.beaconRow}>
        <View>
          <Text style={styles.beaconTitle}>📡 Proximity Beacon</Text>
          <Text style={styles.beaconSub}>
            Vibrates when a member is within {formatDistance(BEACON_THRESHOLD_M)}
          </Text>
        </View>
        <Switch
          value={beaconEnabled}
          onValueChange={setBeaconEnabled}
          trackColor={{ false: colors.textDim, true: colors.success }}
          thumbColor={beaconEnabled ? colors.success : colors.text}
        />
      </View>

      {beaconEnabled && nearestM <= BEACON_THRESHOLD_M && (
        <View style={styles.beaconAlert}>
          <Text style={styles.beaconAlertText}>
            ⚠️ Member nearby — {formatDistance(nearestM)} away
          </Text>
        </View>
      )}

      {/* Member list */}
      <Text style={styles.sectionLabel}>MEMBERS ON RADAR</Text>
      {blips.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {myLocation
              ? 'No group members detected via mesh.\nMembers must be in Bluetooth/WiFi range.'
              : 'Waiting for GPS fix…'}
          </Text>
        </View>
      ) : (
        blips
          .slice()
          .sort((a, b) => a.distanceM - b.distanceM)
          .map((blip) => (
            <View key={blip.riderId} style={styles.memberRow}>
              <View style={styles.memberDot} />
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{blip.riderName}</Text>
                <Text style={styles.memberDetail}>
                  {formatDistance(blip.distanceM)} · {Math.round(blip.bearingDeg)}° {cardinalDir(blip.bearingDeg)}
                </Text>
              </View>
              <Text style={styles.memberBearing}>{cardinalDir(blip.bearingDeg)}</Text>
            </View>
          ))
      )}

      {/* Offline note */}
      <Text style={styles.offlineNote}>
        🔌 Radar works offline — uses Bluetooth mesh peer locations and last-known GPS.
      </Text>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 48 },

  title: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: colors.textDim, fontSize: 13, marginBottom: 24 },

  radarWrap: { alignItems: 'center', marginBottom: 8 },
  rangeLabel: { color: colors.textDim, fontSize: 11, marginTop: 6, textAlign: 'center' },

  beaconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
  },
  beaconTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
  beaconSub: { color: colors.textDim, fontSize: 12, marginTop: 2 },

  beaconAlert: {
    backgroundColor: 'rgba(0,255,136,0.1)',
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
  },
  beaconAlertText: { color: colors.success, fontSize: 13, fontWeight: '600', textAlign: 'center' },

  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },

  emptyBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 24,
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyText: { color: colors.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },

  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 8,
  },
  memberDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    marginRight: 12,
  },
  memberInfo: { flex: 1 },
  memberName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  memberDetail: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  memberBearing: { color: colors.success, fontSize: 14, fontWeight: '700' },

  offlineNote: {
    color: colors.textDim,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
});
