/**
 * SatelliteStatusIndicator — TG-06
 *
 * Small dot + label that shows current satellite connectivity state.
 *
 *   🟢 green  → satellite available
 *   🟡 yellow → searching / transitioning
 *   🔴 red    → unavailable or unsupported
 *
 * Usage:
 *   <SatelliteStatusIndicator />
 */

import React, { useEffect, useState } from 'react';
import { colors } from '../theme/colors';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { SatelliteService, SatelliteStatus, SatelliteStatusEvent } from '../services/SatelliteService';

// ─── Props ────────────────────────────────────────────────────────────────

interface Props {
  /** Hide the text label and show only the dot. Default false. */
  dotOnly?: boolean;
  /** Custom style applied to the outer container. */
  style?: object;
}

// ─── Component ────────────────────────────────────────────────────────────

export const SatelliteStatusIndicator: React.FC<Props> = ({ dotOnly = false, style }) => {
  const [status, setStatus] = useState<SatelliteStatus>('searching');
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    // Start monitoring on mount
    SatelliteService.start((event: SatelliteStatusEvent) => {
      setStatus(event.status);
      setSupported(event.supported);
    });

    return () => {
      SatelliteService.stop();
    };
  }, []);

  // Don't render if the device has no satellite hardware
  if (!supported || status === 'unsupported') {
    return null;
  }

  const dotColor = getDotColor(status);
  const label = getLabel(status);

  return (
    <View style={[styles.container, style]}>
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      {!dotOnly && <Text style={styles.label}>{label}</Text>}
    </View>
  );
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function getDotColor(status: SatelliteStatus): string {
  switch (status) {
    case 'available':   return '#00cc66';  // green
    case 'searching':   return colors.warning;  // yellow
    case 'unavailable': return '#cc3333';  // red
    case 'unsupported': return '#555555';  // grey
    default:            return colors.warning;
  }
}

function getLabel(status: SatelliteStatus): string {
  switch (status) {
    case 'available':   return 'Satellite';
    case 'searching':   return 'Searching…';
    case 'unavailable': return 'No Satellite';
    case 'unsupported': return 'No Satellite';
    default:            return '';
  }
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  label: {
    fontSize: 12,
    color: '#aaaaaa',
    fontWeight: '500',
  },
});

export default SatelliteStatusIndicator;
