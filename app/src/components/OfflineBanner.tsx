/**
 * OfflineBanner — TG-03
 *
 * An orange pill/banner that appears at the top of the screen (below the
 * device safe area) whenever the app has no network connectivity.
 *
 * Shows: "Offline — X pings queued"
 * Auto-dismisses as soon as connectivity returns (no manual dismiss needed).
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
import { useOfflineQueue } from '../hooks/useOfflineQueue';

export function OfflineBanner(): React.ReactElement | null {
  const { isOffline, queueCount } = useOfflineQueue();
  const insets = useSafeAreaInsets();

  // Slide in/out animation
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const mountedRef = useRef(false);

  useEffect(() => {
    if (!mountedRef.current) {
      // Skip animation on initial render if online — just stay hidden
      mountedRef.current = true;
      if (isOffline) {
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 80,
          friction: 10,
        }).start();
      }
      return;
    }

    if (isOffline) {
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 80,
        friction: 10,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: -80,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isOffline, slideAnim]);

  const label =
    queueCount > 0
      ? `Offline — ${queueCount} ping${queueCount === 1 ? '' : 's'} queued`
      : 'Offline — no signal';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.wrapper,
        { top: insets.top, transform: [{ translateY: slideAnim }] },
      ]}
    >
      <View style={styles.pill}>
        <View style={styles.dot} />
        <Text style={styles.label}>{label}</Text>
      </View>
    </Animated.View>
  );
}

const ORANGE = colors.accent; // trail accent

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
    paddingTop: 8,
    pointerEvents: 'none',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: ORANGE,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 14,
    // Subtle shadow so it floats above map/content
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
  label: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
