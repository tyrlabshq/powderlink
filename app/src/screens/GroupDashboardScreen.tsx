import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Alert, ActivityIndicator, Share, Clipboard,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { fetchMembers, leaveGroup, disbandGroup } from '../api/groups';
import type { GroupMember } from '../api/groups';
import { startRide, endRide, getActiveRide } from '../api/rides';
import { useGroup } from '../context/GroupContext';
import { colors } from '../theme/colors';
import type { GroupStackParamList } from '../navigation/AppNavigator';
import type { Ride } from '../api/rides';

type Nav = StackNavigationProp<GroupStackParamList, 'GroupDashboard'>;

export default function GroupDashboardScreen() {
  const navigation = useNavigation<Nav>();
  const { group, members, setMembers, clearGroup } = useGroup();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeRideId, setActiveRideId] = useState<string | null>(null);
  const [rideStartedAt, setRideStartedAt] = useState<string | null>(null);
  const [rideLoading, setRideLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const loadMembers = useCallback(async () => {
    if (!group) return;
    try {
      const list = await fetchMembers(group.groupId);
      setMembers(list);
    } catch {
      // Non-fatal — show stale data
    } finally {
      setLoading(false);
    }
  }, [group, setMembers]);

  const checkActiveRide = useCallback(async () => {
    if (!group) return;
    try {
      const status = await getActiveRide(group.groupId);
      if (status.active && status.rideId) {
        setActiveRideId(status.rideId);
        setRideStartedAt(status.startedAt ?? null);
      } else {
        setActiveRideId(null);
        setRideStartedAt(null);
      }
    } catch {
      // Non-fatal
    }
  }, [group]);

  useEffect(() => {
    loadMembers();
    checkActiveRide();
    const interval = setInterval(() => {
      loadMembers();
      checkActiveRide();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadMembers, checkActiveRide]);

  // Elapsed timer for active rides
  useEffect(() => {
    if (!rideStartedAt) { setElapsed(0); return; }
    const update = () => {
      const diff = Math.floor((Date.now() - new Date(rideStartedAt).getTime()) / 1000);
      setElapsed(diff);
    };
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [rideStartedAt]);

  function copyCode() {
    if (!group) return;
    Clipboard.setString(group.code);
    Alert.alert('Copied!', `Code ${group.code} copied to clipboard`);
  }

  async function shareCode() {
    if (!group) return;
    await Share.share({ message: `Join my PowderLink group: ${group.code}` });
  }

  async function handleStartRide() {
    if (!group) return;
    setRideLoading(true);
    try {
      const result = await startRide(group.groupId);
      setActiveRideId(result.rideId);
      setRideStartedAt(result.startedAt);
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start ride');
    } finally {
      setRideLoading(false);
    }
  }

  async function handleEndRide() {
    if (!group || !activeRideId) return;
    Alert.alert(
      'End Ride',
      'Are you sure you want to end the ride? Stats will be calculated for everyone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Ride', style: 'destructive', onPress: async () => {
            setRideLoading(true);
            try {
              const result = await endRide(activeRideId);
              setActiveRideId(null);
              setRideStartedAt(null);
              // Build a minimal Ride object to pass to summary screen
              const rideForSummary: Ride = {
                rideId: result.rideId,
                groupId: group.groupId,
                groupName: group.name,
                name: null,
                startedAt: rideStartedAt ?? new Date().toISOString(),
                endedAt: result.endedAt,
                stats: result.stats,
              };
              navigation.navigate('RideSummary', { ride: rideForSummary });
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to end ride');
            } finally {
              setRideLoading(false);
            }
          },
        },
      ]
    );
  }

  async function handleLeave() {
    if (!group) return;
    Alert.alert('Leave Group', 'Are you sure you want to leave?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await leaveGroup(group.groupId);
            clearGroup();
            navigation.replace('GroupHome');
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to leave');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }

  async function handleDisband() {
    if (!group) return;
    Alert.alert('Disband Group', 'This will remove everyone. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disband', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await disbandGroup(group.groupId);
            clearGroup();
            navigation.replace('GroupHome');
          } catch (e: unknown) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to disband');
          } finally {
            setActionLoading(false);
          }
        },
      },
    ]);
  }

  function formatElapsed(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  if (!group) {
    navigation.replace('GroupHome');
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.groupName}>{group.name}</Text>
        <TouchableOpacity style={styles.codeRow} onPress={copyCode}>
          <Text style={styles.code}>{group.code}</Text>
          <Text style={styles.codeCopy}>  tap to copy</Text>
        </TouchableOpacity>
      </View>

      {/* Active Ride Banner */}
      {activeRideId && (
        <View style={styles.rideBanner}>
          <View style={styles.rideIndicator} />
          <View style={styles.rideBannerText}>
            <Text style={styles.rideBannerTitle}>🛷 Ride In Progress</Text>
            <Text style={styles.rideTimer}>{formatElapsed(elapsed)}</Text>
          </View>
        </View>
      )}

      {/* Members */}
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.riderId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <MemberRow member={item} />}
          ListEmptyComponent={<Text style={styles.empty}>No members yet</Text>}
        />
      )}

      {/* Actions */}
      <View style={styles.actions}>
        {/* Ride Control */}
        {activeRideId ? (
          <TouchableOpacity
            style={[styles.endRideBtn, rideLoading && styles.btnDisabled]}
            onPress={handleEndRide}
            disabled={rideLoading}
          >
            {rideLoading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.endRideBtnText}>🏁 End Ride</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.startRideBtn, rideLoading && styles.btnDisabled]}
            onPress={handleStartRide}
            disabled={rideLoading}
          >
            {rideLoading
              ? <ActivityIndicator color={colors.accent} />
              : <Text style={styles.startRideBtnText}>▶ Start Ride</Text>}
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.shareBtn} onPress={shareCode}>
          <Text style={styles.shareBtnText}>Share Code</Text>
        </TouchableOpacity>

        {group.role === 'leader' ? (
          <TouchableOpacity
            style={[styles.dangerBtn, actionLoading && styles.btnDisabled]}
            onPress={handleDisband}
            disabled={actionLoading}
          >
            {actionLoading
              ? <ActivityIndicator color={colors.danger} />
              : <Text style={styles.dangerBtnText}>Disband Group</Text>}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.dangerBtn, actionLoading && styles.btnDisabled]}
            onPress={handleLeave}
            disabled={actionLoading}
          >
            {actionLoading
              ? <ActivityIndicator color={colors.danger} />
              : <Text style={styles.dangerBtnText}>Leave Group</Text>}
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function MemberRow({ member }: { member: GroupMember }) {
  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.dot, { backgroundColor: member.online ? colors.success : colors.textDim }]} />
      <Text style={rowStyles.name}>{member.name}</Text>
      <View style={[rowStyles.badge, member.role === 'leader' && rowStyles.badgeLeader]}>
        <Text style={[rowStyles.badgeText, member.role === 'leader' && rowStyles.badgeLeaderText]}>
          {member.role === 'leader' ? 'Leader' : 'Member'}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { padding: 24, paddingTop: 60, backgroundColor: colors.surface },
  groupName: { color: colors.text, fontSize: 26, fontWeight: '700', marginBottom: 8 },
  codeRow: { flexDirection: 'row', alignItems: 'center' },
  code: { color: colors.accent, fontSize: 22, fontWeight: '700', letterSpacing: 4 },
  codeCopy: { color: colors.textDim, fontSize: 12 },

  rideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '18',
    borderBottomWidth: 1,
    borderBottomColor: colors.success + '44',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  rideIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.success,
    marginRight: 12,
  },
  rideBannerText: { flex: 1 },
  rideBannerTitle: { color: colors.success, fontSize: 14, fontWeight: '600' },
  rideTimer: { color: colors.success, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] },

  list: { padding: 16 },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 32 },
  actions: { padding: 20, gap: 12 },

  startRideBtn: {
    borderColor: colors.success,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  startRideBtnText: { color: colors.success, fontSize: 16, fontWeight: '700' },

  endRideBtn: {
    backgroundColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  endRideBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  shareBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  shareBtnText: { color: '#000', fontSize: 16, fontWeight: '700' },
  dangerBtn: {
    borderColor: colors.danger,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  dangerBtnText: { color: colors.danger, fontSize: 16, fontWeight: '600' },
  btnDisabled: { opacity: 0.5 },
});

const rowStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
  },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  name: { color: colors.text, fontSize: 16, flex: 1 },
  badge: {
    backgroundColor: colors.textDim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeLeader: { backgroundColor: colors.accent + '33' },
  badgeText: { color: colors.text, fontSize: 12 },
  badgeLeaderText: { color: colors.accent },
});
