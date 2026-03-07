import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from 'react-native';
import type { MemberLocation } from '../hooks/useGroupWebSocket';
import { colors } from '../theme/colors';

const PANEL_HEIGHT = 320;

function getRelativeTime(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  if (isNaN(ms) || ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function getBatteryColor(battery: number): string {
  if (battery > 50) return colors.success;
  if (battery > 20) return colors.warning;
  return colors.danger;
}

function getBatteryIcon(battery: number): string {
  if (battery > 75) return '🔋';
  if (battery > 50) return '🔋';
  if (battery > 20) return '🪫';
  return '🪫';
}

interface MemberListPanelProps {
  visible: boolean;
  members: MemberLocation[];
  onClose: () => void;
  onMemberPress: (member: MemberLocation) => void;
}

export function MemberListPanel({
  visible,
  members,
  onClose,
  onMemberPress,
}: MemberListPanelProps) {
  const slideAnim = useRef(new Animated.Value(PANEL_HEIGHT)).current;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : PANEL_HEIGHT,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();
  }, [visible, slideAnim]);

  return (
    <Animated.View
      style={[styles.panel, { transform: [{ translateY: slideAnim }] }]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      {/* Handle bar */}
      <View style={styles.handleBar} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Group Members ({members.length})</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Members list */}
      <ScrollView
        style={styles.list}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={members.length === 0 ? styles.emptyContainer : undefined}
      >
        {members.length === 0 ? (
          <Text style={styles.emptyText}>No members online</Text>
        ) : (
          members.map((member) => (
            <TouchableOpacity
              key={member.userId}
              style={styles.row}
              onPress={() => onMemberPress(member)}
              activeOpacity={0.7}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.memberId} numberOfLines={1}>
                  {member.userId}
                </Text>
                <Text style={styles.lastSeen}>
                  {getRelativeTime(member.timestamp)}
                </Text>
              </View>
              <View style={styles.rowRight}>
                <Text style={styles.speed}>
                  {Math.round(member.speed)} mph
                </Text>
                <Text
                  style={[
                    styles.battery,
                    { color: getBatteryColor(member.battery) },
                  ]}
                >
                  {getBatteryIcon(member.battery)} {member.battery}%
                </Text>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_HEIGHT,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 20,
  },
  handleBar: {
    width: 40,
    height: 4,
    backgroundColor: colors.textDim,
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  closeBtn: {
    padding: 4,
  },
  closeTxt: {
    color: colors.textDim,
    fontSize: 18,
  },
  list: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 14,
    marginTop: 32,
    textAlign: 'center',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowLeft: {
    flex: 1,
    marginRight: 12,
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  memberId: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
  lastSeen: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },
  speed: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  battery: {
    fontSize: 12,
    marginTop: 3,
    fontWeight: '600',
  },
});
