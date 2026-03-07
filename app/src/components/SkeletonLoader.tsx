import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, ViewStyle } from 'react-native';
import { colors } from '../theme/colors';

interface SkeletonBlockProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Single animated skeleton block — pulses opacity to indicate loading.
 */
export function SkeletonBlock({ width = '100%', height = 16, borderRadius = 6, style }: SkeletonBlockProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: colors.surface, opacity },
        style,
      ]}
    />
  );
}

/**
 * Ride history skeleton — mimics a list of ride rows.
 */
export function RideHistorySkeleton() {
  return (
    <View style={skeletonStyles.container}>
      {[0, 1, 2].map((i) => (
        <View key={i} style={skeletonStyles.row}>
          <View style={skeletonStyles.rowLeft}>
            <SkeletonBlock width="55%" height={14} style={{ marginBottom: 8 }} />
            <SkeletonBlock width="75%" height={11} style={{ marginBottom: 12 }} />
            <View style={skeletonStyles.chips}>
              <SkeletonBlock width={70} height={22} borderRadius={8} />
              <SkeletonBlock width={70} height={22} borderRadius={8} />
              <SkeletonBlock width={70} height={22} borderRadius={8} />
            </View>
          </View>
          <SkeletonBlock width={16} height={24} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

/**
 * Map loading skeleton — shown while map tiles and data are initializing.
 */
export function MapLoadingSkeleton() {
  return (
    <View style={skeletonStyles.mapContainer}>
      {/* Map placeholder */}
      <SkeletonBlock width="100%" height="100%" borderRadius={0} style={skeletonStyles.mapBlock} />
      {/* HUD placeholder */}
      <View style={skeletonStyles.mapHud}>
        <SkeletonBlock width={72} height={24} borderRadius={8} />
        <SkeletonBlock width={56} height={20} borderRadius={8} style={{ marginTop: 6 }} />
      </View>
      {/* Button placeholders */}
      <View style={skeletonStyles.mapBtns}>
        <SkeletonBlock width={48} height={48} borderRadius={24} style={{ marginBottom: 12 }} />
        <SkeletonBlock width={48} height={48} borderRadius={24} style={{ marginBottom: 12 }} />
        <SkeletonBlock width={48} height={48} borderRadius={24} />
      </View>
    </View>
  );
}

const skeletonStyles = StyleSheet.create({
  container: {
    padding: 16,
    paddingTop: 12,
  },
  row: {
    backgroundColor: 'rgba(13,21,32,0.8)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.05)',
  },
  rowLeft: { flex: 1 },
  chips: { flexDirection: 'row', gap: 8 },
  mapContainer: { flex: 1, position: 'relative' },
  mapBlock: { flex: 1 } as any,
  mapHud: { position: 'absolute', top: 72, right: 12, gap: 4 },
  mapBtns: { position: 'absolute', bottom: 100, right: 16 },
});
