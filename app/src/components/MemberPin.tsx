import React from 'react';
import { colors } from '../theme/colors';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import type { MemberLocation, CMOState } from '../hooks/useGroupWebSocket';

/**
 * Derive a stable color from a userId string via a simple hash.
 * Returns one of 12 visually distinct colors.
 */
function hashColor(userId: string): string {
  const COLORS = [
    '#e74c3c',
    '#e67e22',
    '#f39c12',
    '#2ecc71',
    '#1abc9c',
    '#3498db',
    '#9b59b6',
    '#e91e63',
    '#00bcd4',
    '#8bc34a',
    '#ff5722',
    '#607d8b',
  ];
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Extract up to 2 initials from a display name.
 * Falls back to first 2 chars of userId.
 */
function getInitials(displayName: string | undefined, userId: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return displayName.slice(0, 2).toUpperCase();
  }
  return userId.slice(0, 2).toUpperCase();
}

interface MemberPinProps {
  member: MemberLocation;
  /** Optional human-readable display name. Falls back to userId initials. */
  displayName?: string;
  onPress: (member: MemberLocation) => void;
  /** Count-me-out state for this rider — shows hourglass + countdown when active. */
  cmoState?: CMOState | null;
}

/** Format minutes remaining for the hourglass countdown label. */
function formatCMORemaining(etaAt: string): string {
  const ms = new Date(etaAt).getTime() - Date.now();
  if (ms <= 0) return 'EXP';
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function MemberPin({ member, displayName, onPress, cmoState }: MemberPinProps) {
  const color = hashColor(member.userId);
  const initials = getInitials(displayName, member.userId);
  const label = displayName ?? member.userId;
  const isCMOActive = !!cmoState;

  return (
    <TouchableOpacity
      onPress={() => onPress(member)}
      style={styles.container}
      activeOpacity={0.8}
    >
      <View style={[styles.circle, { backgroundColor: color }, isCMOActive && styles.circleCMO]}>
        {isCMOActive ? (
          <Text style={styles.hourglass}>⏳</Text>
        ) : (
          <Text style={styles.initials}>{initials}</Text>
        )}
      </View>
      {isCMOActive && cmoState && (
        <View style={styles.cmoCountdown}>
          <Text style={styles.cmoCountdownText}>{formatCMORemaining(cmoState.etaAt)}</Text>
        </View>
      )}
      <Text style={styles.name} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    maxWidth: 60,
  },
  circle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
    elevation: 5,
  },
  circleCMO: {
    borderColor: colors.warning,
    borderWidth: 2.5,
    opacity: 0.85,
  },
  initials: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
    letterSpacing: 0.5,
  },
  hourglass: {
    fontSize: 18,
  },
  cmoCountdown: {
    backgroundColor: 'rgba(255,170,0,0.90)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
    marginBottom: 1,
  },
  cmoCountdownText: {
    color: '#000',
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  name: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
});
