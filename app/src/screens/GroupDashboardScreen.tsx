import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Alert, ActivityIndicator, Share, Clipboard,
  Modal, TextInput, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { fetchMembers, leaveGroup, disbandGroup, assignMemberRole } from '../api/groups';
import type { GroupMember } from '../api/groups';
import { startRide, endRide, getActiveRide } from '../api/rides';
import { startCountMeOut, cancelCountMeOut, getCountMeOutStatus } from '../api/countMeOut';
import type { CMODuration } from '../api/countMeOut';
import { useGroup } from '../context/GroupContext';
import { useGroupWebSocket } from '../hooks/useGroupWebSocket';
import { GroupMessagingPanel } from '../components/GroupMessagingPanel';
import { useMeshNetwork } from '../hooks/useMeshNetwork';
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

  // Count-me-out state
  const [cmoActive, setCmoActive] = useState(false);
  const [cmoEta, setCmoEta] = useState<string | null>(null);
  const [cmoModalVisible, setCmoModalVisible] = useState(false);
  const [cmoSelectedDuration, setCmoSelectedDuration] = useState<CMODuration>(30);
  const [cmoNote, setCmoNote] = useState('');
  const [cmoLoading, setCmoLoading] = useState(false);

  // Rider identity — loaded from AsyncStorage (set during onboarding/auth)
  const [riderId, setRiderId] = useState<string | undefined>(undefined);
  const [riderName, setRiderName] = useState<string | undefined>(undefined);

  useEffect(() => {
    AsyncStorage.multiGet(['riderId', 'riderName']).then((pairs) => {
      const id = pairs.find(([k]) => k === 'riderId')?.[1] ?? undefined;
      const name = pairs.find(([k]) => k === 'riderName')?.[1] ?? undefined;
      setRiderId(id ?? undefined);
      setRiderName(name ?? undefined);
    }).catch(() => {/* non-fatal */});
  }, []);

  // Group WebSocket — enables in-ride messaging (auto-joins group when connected)
  const { messages: groupMessages, sendGroupMessage, connected: wsConnected } = useGroupWebSocket(
    group && riderId ? { groupId: group.groupId, riderId, riderName } : undefined,
  );

  // Mesh network — offline group messaging and location sharing
  const {
    meshMessages,
    meshConnected,
    meshPeerCount,
    sendMeshMessage,
  } = useMeshNetwork(riderId ? { riderId, riderName } : undefined);

  // Merge WS + mesh messages and deduplicate by messageId
  const allMessages = React.useMemo(() => {
    const seen = new Set<string>();
    const merged = [...groupMessages, ...meshMessages].filter((m) => {
      if (seen.has(m.messageId)) return false;
      seen.add(m.messageId);
      return true;
    });
    return merged.sort((a, b) => a.timestamp - b.timestamp);
  }, [groupMessages, meshMessages]);

  // When offline, route messages through mesh instead
  const handleSendMessage = React.useCallback(
    (text: string, preset?: string | null) => {
      if (wsConnected) {
        sendGroupMessage(text, preset ?? null);
      } else {
        sendMeshMessage(text, preset ?? null);
      }
    },
    [wsConnected, sendGroupMessage, sendMeshMessage],
  );

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

  const checkCMOStatus = useCallback(async () => {
    try {
      const status = await getCountMeOutStatus();
      if (status.active) {
        setCmoActive(true);
        setCmoEta(status.etaAt);
      } else {
        setCmoActive(false);
        setCmoEta(null);
      }
    } catch {
      // Non-fatal
    }
  }, []);

  useEffect(() => {
    loadMembers();
    checkActiveRide();
    checkCMOStatus();
    const interval = setInterval(() => {
      loadMembers();
      checkActiveRide();
      checkCMOStatus();
    }, 15000);
    return () => clearInterval(interval);
  }, [loadMembers, checkActiveRide, checkCMOStatus]);

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

  async function handleStartCMO() {
    if (!group) return;
    setCmoLoading(true);
    try {
      const result = await startCountMeOut(group.groupId, cmoSelectedDuration, cmoNote.trim() || undefined);
      setCmoActive(true);
      setCmoEta(result.etaAt);
      setCmoModalVisible(false);
      setCmoNote('');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start timer');
    } finally {
      setCmoLoading(false);
    }
  }

  async function handleCancelCMO() {
    Alert.alert(
      "I'm Back!",
      'Cancel your count-me-out timer and rejoin the group?',
      [
        { text: 'Not yet', style: 'cancel' },
        {
          text: "I'm Back", onPress: async () => {
            setCmoLoading(true);
            try {
              await cancelCountMeOut();
              setCmoActive(false);
              setCmoEta(null);
            } catch (e: unknown) {
              Alert.alert('Error', e instanceof Error ? e.message : 'Failed to cancel timer');
            } finally {
              setCmoLoading(false);
            }
          },
        },
      ],
    );
  }

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

  async function handleAssignRole(member: GroupMember, role: 'sweep' | 'member') {
    if (!group) return;
    try {
      await assignMemberRole(group.groupId, member.riderId, role);
      await loadMembers();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to assign role');
    }
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

  const CMO_DURATIONS: CMODuration[] = [15, 30, 45, 60, 90];

  if (!group) {
    navigation.replace('GroupHome');
    return null;
  }

  return (
    <View style={styles.container}>
      {/* Count Me Out modal */}
      <Modal
        visible={cmoModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setCmoModalVisible(false)}
      >
        <View style={modalStyles.overlay}>
          <View style={modalStyles.sheet}>
            <Text style={modalStyles.title}>⏱ Count Me Out</Text>
            <Text style={modalStyles.subtitle}>
              Taking a detour? Set a timer. Your group will see your pin with a countdown,
              and get an alert if you don't rejoin by ETA.
            </Text>

            <Text style={modalStyles.sectionLabel}>DETOUR DURATION</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={modalStyles.durationRow}>
              {CMO_DURATIONS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[modalStyles.durationBtn, cmoSelectedDuration === d && modalStyles.durationBtnActive]}
                  onPress={() => setCmoSelectedDuration(d)}
                >
                  <Text style={[modalStyles.durationBtnText, cmoSelectedDuration === d && modalStyles.durationBtnTextActive]}>
                    {d}m
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={modalStyles.sectionLabel}>NOTE (optional)</Text>
            <TextInput
              style={modalStyles.noteInput}
              value={cmoNote}
              onChangeText={setCmoNote}
              placeholder="e.g. taking the ice road"
              placeholderTextColor={colors.textDim}
              maxLength={120}
              autoCapitalize="sentences"
            />

            <View style={modalStyles.actions}>
              <TouchableOpacity
                style={modalStyles.cancelBtn}
                onPress={() => { setCmoModalVisible(false); setCmoNote(''); }}
              >
                <Text style={modalStyles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[modalStyles.confirmBtn, cmoLoading && styles.btnDisabled]}
                onPress={handleStartCMO}
                disabled={cmoLoading}
              >
                {cmoLoading
                  ? <ActivityIndicator color="#000" />
                  : <Text style={modalStyles.confirmBtnText}>Start {cmoSelectedDuration}m Timer</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

      {/* In-Ride Group Messaging — WS primary, mesh fallback when offline */}
      {activeRideId && (
        <GroupMessagingPanel
          messages={allMessages}
          onSend={handleSendMessage}
          connected={wsConnected || meshConnected}
          currentRiderId={riderId}
          offlineMode={!wsConnected && meshConnected}
          meshPeerCount={meshPeerCount}
        />
      )}

      {/* Members */}
      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 32 }} />
      ) : (
        <FlatList
          data={members}
          keyExtractor={(m) => m.riderId}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <MemberRow
              member={item}
              isLeader={group?.role === 'leader'}
              onAssignSweep={(m) => handleAssignRole(m, 'sweep')}
              onRemoveSweep={(m) => handleAssignRole(m, 'member')}
            />
          )}
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

        {/* Count Me Out */}
        {cmoActive ? (
          <TouchableOpacity
            style={[styles.cmoActiveBtn, cmoLoading && styles.btnDisabled]}
            onPress={handleCancelCMO}
            disabled={cmoLoading}
          >
            {cmoLoading
              ? <ActivityIndicator color="#fff" />
              : (
                <View>
                  <Text style={styles.cmoActiveBtnTitle}>⏳ Counting Out…</Text>
                  {cmoEta && (
                    <Text style={styles.cmoActiveBtnSub}>
                      Back by {new Date(cmoEta).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                  <Text style={styles.cmoActiveBtnHint}>Tap to cancel — I'm Back!</Text>
                </View>
              )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.cmoBtn}
            onPress={() => setCmoModalVisible(true)}
          >
            <Text style={styles.cmoBtnText}>⏱ Count Me Out</Text>
          </TouchableOpacity>
        )}

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

const ROLE_LABELS: Record<string, string> = {
  leader: 'Leader',
  sweep: 'Sweep',
  member: 'Member',
};

function MemberRow({
  member,
  isLeader,
  onAssignSweep,
  onRemoveSweep,
}: {
  member: GroupMember;
  isLeader: boolean;
  onAssignSweep?: (member: GroupMember) => void;
  onRemoveSweep?: (member: GroupMember) => void;
}) {
  const isSweep = member.role === 'sweep';
  const showSweepAction = isLeader && member.role !== 'leader';

  return (
    <View style={rowStyles.row}>
      <View style={[rowStyles.dot, { backgroundColor: member.online ? colors.success : colors.textDim }]} />
      <Text style={rowStyles.name}>{member.name}</Text>
      <View style={rowStyles.rowRight}>
        <View style={[
          rowStyles.badge,
          member.role === 'leader' && rowStyles.badgeLeader,
          isSweep && rowStyles.badgeSweep,
        ]}>
          <Text style={[
            rowStyles.badgeText,
            member.role === 'leader' && rowStyles.badgeLeaderText,
            isSweep && rowStyles.badgeSweepText,
          ]}>
            {ROLE_LABELS[member.role] ?? member.role}
          </Text>
        </View>
        {showSweepAction && (
          <TouchableOpacity
            style={[rowStyles.sweepBtn, isSweep && rowStyles.sweepBtnActive]}
            onPress={() => isSweep ? onRemoveSweep?.(member) : onAssignSweep?.(member)}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[rowStyles.sweepBtnText, isSweep && rowStyles.sweepBtnTextActive]}>
              {isSweep ? 'Unsweep' : 'Make Sweep'}
            </Text>
          </TouchableOpacity>
        )}
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

  // Count Me Out button (inactive)
  cmoBtn: {
    borderColor: '#ffaa00',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cmoBtnText: { color: '#ffaa00', fontSize: 16, fontWeight: '700' },

  // Count Me Out button (active — shows current timer)
  cmoActiveBtn: {
    backgroundColor: 'rgba(255,170,0,0.15)',
    borderColor: '#ffaa00',
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  cmoActiveBtnTitle: { color: '#ffaa00', fontSize: 16, fontWeight: '700', textAlign: 'center' },
  cmoActiveBtnSub: { color: '#ffaa00', fontSize: 13, textAlign: 'center', marginTop: 2 },
  cmoActiveBtnHint: { color: colors.textDim, fontSize: 11, textAlign: 'center', marginTop: 4 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    paddingBottom: 40,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  durationRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  durationBtn: {
    borderWidth: 1.5,
    borderColor: colors.textDim,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    marginRight: 10,
    alignItems: 'center',
  },
  durationBtnActive: {
    borderColor: '#ffaa00',
    backgroundColor: 'rgba(255,170,0,0.15)',
  },
  durationBtnText: {
    color: colors.textDim,
    fontSize: 15,
    fontWeight: '600',
  },
  durationBtnTextActive: {
    color: '#ffaa00',
  },
  noteInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textDim,
    borderRadius: 10,
    color: colors.text,
    fontSize: 15,
    padding: 12,
    marginBottom: 24,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: colors.textDim,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: colors.textDim,
    fontSize: 16,
    fontWeight: '600',
  },
  confirmBtn: {
    flex: 2,
    backgroundColor: '#ffaa00',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
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
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: {
    backgroundColor: colors.textDim,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  badgeLeader: { backgroundColor: colors.accent + '33' },
  badgeSweep: { backgroundColor: '#aa88ff33' },
  badgeText: { color: colors.text, fontSize: 12 },
  badgeLeaderText: { color: colors.accent },
  badgeSweepText: { color: '#aa88ff' },
  sweepBtn: {
    borderWidth: 1,
    borderColor: colors.textDim,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  sweepBtnActive: { borderColor: '#aa88ff', backgroundColor: '#aa88ff22' },
  sweepBtnText: { color: colors.textDim, fontSize: 11, fontWeight: '600' },
  sweepBtnTextActive: { color: '#aa88ff' },
});
