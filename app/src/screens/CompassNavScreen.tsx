/**
 * CompassNavScreen — TG-08
 *
 * Compass + GPS-only navigation mode.
 * Requires zero network — works deep in the backcountry on cellular deadspot.
 *
 * Features:
 *  - Magnetic compass rose that rotates in real-time (react-native-sensors)
 *  - Live GPS: lat, lng, altitude (ft), speed (mph), accuracy (m)
 *  - Estimated position via dead reckoning (shown when moving + heading known)
 *  - Cardinal direction label (N / NE / E / … )
 *  - Grid-reference display (lat/lng decimal + DMS)
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Platform,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  magnetometer,
  SensorTypes,
  setUpdateIntervalForType,
} from 'react-native-sensors';
import BackgroundGeolocation, { type Location } from 'react-native-background-geolocation';
import { colors } from '../theme/colors';

// ─── Constants ────────────────────────────────────────────────────────────────

const COMPASS_SIZE = 260;
const TICK_COUNT = 72; // major tick every 5°
const GPS_POLL_MS = 3_000;
const SENSOR_INTERVAL_MS = 100;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDMS(decimal: number, isLng: boolean): string {
  const abs = Math.abs(decimal);
  const deg = Math.floor(abs);
  const minFloat = (abs - deg) * 60;
  const min = Math.floor(minFloat);
  const sec = ((minFloat - min) * 60).toFixed(1);
  const dir = isLng
    ? decimal >= 0 ? 'E' : 'W'
    : decimal >= 0 ? 'N' : 'S';
  return `${deg}° ${min}' ${sec}" ${dir}`;
}

function bearingLabel(deg: number): string {
  const dirs = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const idx = Math.round(deg / 22.5) % 16;
  return dirs[idx];
}

/** Low-pass filter coefficient: 0 = no smoothing, 1 = frozen */
const LP_ALPHA = 0.3;

function lerpAngle(from: number, to: number, t: number): number {
  let diff = to - from;
  // Wrap to [-180, 180]
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return from + diff * t;
}

// ─── Compass Rose SVG-like renderer ──────────────────────────────────────────

function CompassRose({ headingDeg }: { headingDeg: number }) {
  // Rotate the rose so that the current heading faces up (rose rotates, not needle)
  const rotation = `${-headingDeg}deg`;

  return (
    <View style={styles.roseContainer}>
      {/* Static outer ring */}
      <View style={styles.roseOuter} />

      {/* Rotating disc */}
      <Animated.View
        style={[styles.roseDisc, { transform: [{ rotate: rotation }] }]}
      >
        {/* Tick marks */}
        {Array.from({ length: TICK_COUNT }).map((_, i) => {
          const angle = (i * 360) / TICK_COUNT;
          const isCardinal = i % (TICK_COUNT / 4) === 0;
          const isMajor = i % (TICK_COUNT / 12) === 0;
          const tickH = isCardinal ? 20 : isMajor ? 12 : 6;
          const tickW = isCardinal ? 3 : 1.5;
          const tickColor = isCardinal ? colors.accent : 'rgba(200,212,224,0.5)';
          return (
            <View
              key={i}
              style={[
                styles.tick,
                {
                  transform: [
                    { rotate: `${angle}deg` },
                    { translateY: -(COMPASS_SIZE / 2 - 8) },
                  ],
                  height: tickH,
                  width: tickW,
                  backgroundColor: tickColor,
                },
              ]}
            />
          );
        })}

        {/* Cardinal labels */}
        {(['N', 'E', 'S', 'W'] as const).map((dir, i) => {
          const angle = i * 90;
          const r = COMPASS_SIZE / 2 - 36;
          const rad = ((angle - 90) * Math.PI) / 180;
          const x = Math.cos(rad) * r;
          const y = Math.sin(rad) * r;
          return (
            <Text
              key={dir}
              style={[
                styles.cardinalLabel,
                {
                  position: 'absolute',
                  left: COMPASS_SIZE / 2 + x - 10,
                  top: COMPASS_SIZE / 2 + y - 11,
                  color: dir === 'N' ? colors.danger : colors.text,
                  fontWeight: dir === 'N' ? '800' : '600',
                },
              ]}
            >
              {dir}
            </Text>
          );
        })}
      </Animated.View>

      {/* Fixed north-up needle (red = N, white = S) */}
      <View style={styles.needleContainer} pointerEvents="none">
        <View style={styles.needleNorth} />
        <View style={styles.needleSouth} />
      </View>

      {/* Heading readout at center */}
      <View style={styles.headingCenter} pointerEvents="none">
        <Text style={styles.headingDegText}>{Math.round(headingDeg)}°</Text>
        <Text style={styles.headingDirText}>{bearingLabel(headingDeg)}</Text>
      </View>
    </View>
  );
}

// ─── GPS data row ─────────────────────────────────────────────────────────────

function DataRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={styles.dataRow}>
      <Text style={styles.dataLabel}>{label}</Text>
      <View style={styles.dataRight}>
        <Text style={styles.dataValue}>{value}</Text>
        {sub ? <Text style={styles.dataSub}>{sub}</Text> : null}
      </View>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function CompassNavScreen() {
  const insets = useSafeAreaInsets();

  // Compass state
  const [headingDeg, setHeadingDeg] = useState(0);
  const smoothHeading = useRef(0);
  const sensorSub = useRef<{ unsubscribe: () => void } | null>(null);

  // GPS state
  const [gpsLat, setGpsLat] = useState<number | null>(null);
  const [gpsLng, setGpsLng] = useState<number | null>(null);
  const [gpsAltFt, setGpsAltFt] = useState<number | null>(null);
  const [gpsSpeedMph, setGpsSpeedMph] = useState<number | null>(null);
  const [gpsAccuracyM, setGpsAccuracyM] = useState<number | null>(null);
  const [gpsHeading, setGpsHeading] = useState<number | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [coordFormat, setCoordFormat] = useState<'decimal' | 'dms'>('decimal');
  const gpsTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Magnetometer ────────────────────────────────────────────────────────────

  useEffect(() => {
    setUpdateIntervalForType(SensorTypes.magnetometer, SENSOR_INTERVAL_MS);

    let lastRaw = 0;
    const sub = magnetometer.subscribe({
      next: ({ x, y }: { x: number; y: number }) => {
        // Heading from magnetometer: angle of magnetic North relative to device
        const raw = ((Math.atan2(y, x) * 180) / Math.PI + 360 + 90) % 360;
        // Smooth with low-pass filter
        smoothHeading.current = lerpAngle(smoothHeading.current, raw, LP_ALPHA);
        const rounded = Math.round(smoothHeading.current);
        if (Math.abs(rounded - lastRaw) >= 1) {
          lastRaw = rounded;
          setHeadingDeg(smoothHeading.current);
        }
      },
      error: () => {
        // Sensor not available — heading stays at 0
      },
    });
    sensorSub.current = sub;

    return () => {
      sensorSub.current?.unsubscribe();
    };
  }, []);

  // ── GPS polling ─────────────────────────────────────────────────────────────

  const fetchGPS = useCallback(async () => {
    try {
      const loc: Location = await BackgroundGeolocation.getCurrentPosition({
        samples: 1,
        persist: false,
        timeout: 10,
        maximumAge: GPS_POLL_MS,
      });
      setGpsLat(loc.coords.latitude);
      setGpsLng(loc.coords.longitude);
      const altM = loc.coords.altitude;
      setGpsAltFt(altM != null ? Math.round(altM * 3.281) : null);
      const speedRaw = loc.coords.speed ?? 0;
      setGpsSpeedMph(Math.round(speedRaw * 2.237 * 10) / 10);
      setGpsAccuracyM(loc.coords.accuracy != null ? Math.round(loc.coords.accuracy) : null);
      setGpsHeading(loc.coords.heading ?? null);
      setGpsError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'GPS unavailable';
      setGpsError(msg);
    }
  }, []);

  useEffect(() => {
    void fetchGPS();
    gpsTimer.current = setInterval(() => void fetchGPS(), GPS_POLL_MS);
    return () => {
      if (gpsTimer.current) clearInterval(gpsTimer.current);
    };
  }, [fetchGPS]);

  // ── Effective heading: prefer GPS heading when moving ───────────────────────
  const effectiveHeading =
    gpsHeading != null && gpsSpeedMph != null && gpsSpeedMph > 5
      ? gpsHeading
      : headingDeg;

  return (
    <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Header ── */}
        <Text style={styles.screenTitle}>Compass Navigation</Text>
        <Text style={styles.screenSub}>GPS + compass only · No network needed</Text>

        {/* ── Compass rose ── */}
        <View style={styles.roseWrapper}>
          <CompassRose headingDeg={effectiveHeading} />
        </View>

        {/* ── GPS data card ── */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardTitle}>📍 GPS Position</Text>
            <TouchableOpacity
              onPress={() =>
                setCoordFormat((f) => (f === 'decimal' ? 'dms' : 'decimal'))
              }
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.formatToggle}>
                {coordFormat === 'decimal' ? 'Switch to DMS' : 'Switch to Dec'}
              </Text>
            </TouchableOpacity>
          </View>

          {gpsError ? (
            <Text style={styles.gpsError}>⚠️ {gpsError}</Text>
          ) : gpsLat == null ? (
            <Text style={styles.gpsAcquiring}>Acquiring GPS fix…</Text>
          ) : (
            <>
              <DataRow
                label="Latitude"
                value={
                  coordFormat === 'decimal'
                    ? gpsLat.toFixed(6)
                    : toDMS(gpsLat, false)
                }
              />
              <DataRow
                label="Longitude"
                value={
                  coordFormat === 'decimal'
                    ? gpsLng!.toFixed(6)
                    : toDMS(gpsLng!, true)
                }
              />
              {gpsAltFt != null && (
                <DataRow label="Altitude" value={`${gpsAltFt.toLocaleString()} ft`} />
              )}
              {gpsSpeedMph != null && (
                <DataRow label="Speed" value={`${gpsSpeedMph} mph`} />
              )}
              {gpsAccuracyM != null && (
                <DataRow label="Accuracy" value={`±${gpsAccuracyM} m`} />
              )}
            </>
          )}
        </View>

        {/* ── Compass card ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🧭 Magnetic Heading</Text>
          <DataRow
            label="Heading"
            value={`${Math.round(effectiveHeading)}°`}
            sub={bearingLabel(effectiveHeading)}
          />
          {gpsHeading != null && (
            <DataRow
              label="GPS Track"
              value={`${Math.round(gpsHeading)}°`}
              sub={bearingLabel(gpsHeading)}
            />
          )}
          <Text style={styles.compassHint}>
            Heading is magnetic — add local declination for true north.
          </Text>
        </View>

        {/* ── Tips ── */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>💡 Offline Navigation Tips</Text>
          <Text style={styles.tipText}>
            • Hold the phone flat and level for best compass accuracy.{'\n'}
            • GPS works without signal — it uses satellites, not cell towers.{'\n'}
            • Pre-download map tiles in Offline Maps so you have a reference grid.{'\n'}
            • Dead reckoning on the main map estimates group member positions while offline.
          </Text>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    alignItems: 'center',
  },

  screenTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginTop: 8,
    marginBottom: 4,
    alignSelf: 'flex-start',
  },
  screenSub: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 20,
    alignSelf: 'flex-start',
  },

  // ── Compass rose ──────────────────────────────────────────────────────────
  roseWrapper: {
    width: COMPASS_SIZE + 32,
    height: COMPASS_SIZE + 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  roseContainer: {
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roseOuter: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    borderRadius: COMPASS_SIZE / 2,
    borderWidth: 2,
    borderColor: colors.textDim,
    backgroundColor: 'rgba(13,21,32,0.95)',
  },
  roseDisc: {
    position: 'absolute',
    width: COMPASS_SIZE,
    height: COMPASS_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tick: {
    position: 'absolute',
    top: COMPASS_SIZE / 2,
    left: COMPASS_SIZE / 2 - 0.75,
    transformOrigin: 'top',
    borderRadius: 1,
  },
  cardinalLabel: {
    fontSize: 15,
    textAlign: 'center',
  },
  needleContainer: {
    position: 'absolute',
    width: 6,
    height: COMPASS_SIZE * 0.55,
    alignItems: 'center',
  },
  needleNorth: {
    flex: 1,
    width: 6,
    backgroundColor: colors.danger,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  needleSouth: {
    flex: 1,
    width: 6,
    backgroundColor: 'rgba(200,212,224,0.5)',
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
  },
  headingCenter: {
    position: 'absolute',
    alignItems: 'center',
  },
  headingDegText: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  headingDirText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginTop: -2,
  },

  // ── Data card ─────────────────────────────────────────────────────────────
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 12,
  },
  formatToggle: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  dataLabel: {
    color: colors.textDim,
    fontSize: 13,
  },
  dataRight: {
    alignItems: 'flex-end',
  },
  dataValue: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  dataSub: {
    color: colors.accent,
    fontSize: 11,
    marginTop: 1,
  },
  gpsError: {
    color: colors.danger,
    fontSize: 13,
    paddingVertical: 8,
  },
  gpsAcquiring: {
    color: colors.textDim,
    fontSize: 13,
    fontStyle: 'italic',
    paddingVertical: 8,
  },
  compassHint: {
    color: colors.textDim,
    fontSize: 11,
    marginTop: 10,
    fontStyle: 'italic',
    lineHeight: 16,
  },
  tipText: {
    color: colors.textDim,
    fontSize: 13,
    lineHeight: 22,
  },
});
