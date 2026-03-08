/**
 * OfflineBanner — TG-03 / TG-02
 *
 * An animated pill/banner that appears at the top of the screen (below the
 * device safe area) to indicate degraded connectivity.
 *
 * Three states:
 *   🟠 Offline    — no cell, no WiFi, no satellite
 *                   "Offline — X pings queued"
 *   🔵 Satellite  — no cell/WiFi, but iPhone 14+ satellite radio active
 *                   "Satellite Mode — X queued"
 *   (hidden)      — online; banner is not rendered
 *
 * Auto-dismisses as soon as full connectivity returns (no manual dismiss).
 *
 * TG-02 enhancement: satellite fallback tier is shown distinctly from full
 * offline, so users know the device has a last-resort comms path.
 */

import React, { useEffect, useRef } from 'react';
import { colors } from '../theme/colors';
import {
  Animated,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConnectivity } from '../hooks/useConnectivity';

// ─── Banner heights & animation budget ───────────────────────────────────────
const BANNER_SLIDE_OFFSET = -80;

export function OfflineBanner(): React.ReactElement | null {
  const { tier, queueCount } = useConnectivity();
  const insets = useSafeAreaInsets();

  const isVisible = tier !== 'online';
  const slideAnim = useRef(new Animated.Value(BANNER_SLIDE_OFFSET)).current;
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      // Skip slide-in animation on first render when already online
      if (isVisible) {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start();
      }
      return;
    }

    if (isVisible) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: BANNER_SLIDE_OFFSET,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isVisible, slideAnim]);

  if (!isVisible && !mountedRef.current) return null;

  // ── Label & style based on connectivity tier ─────────────────────────────
  const isSatellite = tier === 'satellite';

  const pillColor = isSatellite ? colors.primary : colors.accentAlt;

  const label = isSatellite
    ? queueCount > 0
      ? `Satellite Mode — ${queueCount} ping${queueCount === 1 ? '' : 's'} queued`
      : 'Satellite Mode — limited data'
    : queueCount > 0
      ? `Offline — ${queueCount} ping${queueCount === 1 ? '' : 's'} queued`
      : 'Offline — no signal';

  const dotIcon = isSatellite ? '🛰' : undefined;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        { top: insets.top, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={[styles.pill, { backgroundColor: pillColor }]}>
        {dotIcon ? (
          <Text style={styles.satelliteIcon}>{dotIcon}</Text>
        ) : (
          <View style={styles.dot} />
        )}
        <Text style={styles.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    paddingTop: 8,
    pointerEvents: 'none',
  } as any,
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 6,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.85)',
    marginRight: 7,
  },
  satelliteIcon: {
    fontSize: 13,
    marginRight: 7,
  },
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
