/**
 * SafetyScreen — TG-03 (updated from PL-07)
 *
 * Stack navigator for the Safety tab:
 *   DMSSettings (initial) → Dead Man's Switch config + active monitoring
 *   SOSMain               → Full SOS screen (unchanged)
 *
 * TG-03 changes:
 *  - Interval options updated to 15 / 30 / 60 min (production-appropriate)
 *  - Replaced useDMSMonitor hook with DeadMansSwitchService singleton
 *  - Replaced DMSModal with DeadMansSwitchModal (2-min countdown + disable option)
 *  - handleTimeout escalates to emergency contacts via DeadMansSwitchService.escalate()
 *  - Crash detection (accelerometer) started/stopped alongside DMS
 *  - Interval persisted to AsyncStorage; loaded on mount
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  Switch,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';

import SOSScreen from './SOSScreen';
import EmergencyScreen from './EmergencyScreen';
import EmergencyInfoScreen from './EmergencyInfoScreen';
import { colors } from '../theme/colors';
import DeadMansSwitchModal from '../components/DeadMansSwitchModal';
import {
  DeadMansSwitchService,
  DMS_INTERVALS,
  type DMSInterval,
} from '../services/DeadMansSwitchService';
import { setDMS, snoozeDMS, disableDMS } from '../api/alerts';
import { useGroup } from '../context/GroupContext';

// ─── Navigator ─────────────────────────────────────────────────────────────

export type SafetyStackParamList = {
  DMSSettings: undefined;
  Emergency: undefined;
  SOSMain: undefined;
  EmergencyInfo: undefined;
};

const Stack = createStackNavigator<SafetyStackParamList>();

// ─── DMSSettings screen ────────────────────────────────────────────────────

function DMSSettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<SafetyStackParamList>>();
  const { group } = useGroup();

  const [dmsEnabled, setDmsEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState<DMSInterval>(15);
  const [modalVisible, setModalVisible] = useState(false);

  // Display: minutes until next alert (refreshed every 30s when DMS is active)
  const [minutesUntilAlert, setMinutesUntilAlert] = useState<number>(15);
  const displayTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Load persisted interval on mount ────────────────────────────────────
  useEffect(() => {
    void DeadMansSwitchService.loadInterval().then(interval => {
      setIntervalMinutes(interval);
      setMinutesUntilAlert(interval);
    });
  }, []);

  // ── Update the status-card display every 30s when DMS is running ─────────
  useEffect(() => {
    if (!dmsEnabled) {
      if (displayTimerRef.current) {
        clearInterval(displayTimerRef.current);
        displayTimerRef.current = null;
      }
      setMinutesUntilAlert(intervalMinutes);
      return;
    }

    const tick = () => {
      const lastMoved = DeadMansSwitchService.getLastMovedAt();
      if (lastMoved) {
        const elapsedMs = Date.now() - lastMoved.getTime();
        const remaining = Math.max(
          0,
          intervalMinutes - Math.round(elapsedMs / 60_000),
        );
        setMinutesUntilAlert(remaining);
      }
    };

    tick(); // Immediate first tick
    displayTimerRef.current = setInterval(tick, 30_000);

    return () => {
      if (displayTimerRef.current) {
        clearInterval(displayTimerRef.current);
        displayTimerRef.current = null;
      }
    };
  }, [dmsEnabled, intervalMinutes]);

  // ── Alert callback — stable ref so service doesn't receive stale closure ──
  const handleAlertNeeded = useCallback(() => {
    setModalVisible(true);
  }, []);

  // ── Toggle DMS on / off ──────────────────────────────────────────────────
  const handleToggle = async (enabled: boolean) => {
    setDmsEnabled(enabled);

    if (enabled) {
      DeadMansSwitchService.start(intervalMinutes, handleAlertNeeded);
      DeadMansSwitchService.startCrashDetection();
      setMinutesUntilAlert(intervalMinutes);

      if (group) {
        try {
          await setDMS(group.groupId, intervalMinutes);
        } catch (err) {
          console.warn('[DMS] Failed to activate on server:', err);
        }
      }
    } else {
      DeadMansSwitchService.stop();
      DeadMansSwitchService.stopCrashDetection();

      try {
        await disableDMS();
      } catch (err) {
        console.warn('[DMS] Failed to disable on server:', err);
      }
    }
  };

  // ── Change alert interval ────────────────────────────────────────────────
  const handleIntervalChange = async (mins: DMSInterval) => {
    setIntervalMinutes(mins);
    await DeadMansSwitchService.saveInterval(mins);

    if (dmsEnabled) {
      // Re-start with the new interval
      DeadMansSwitchService.start(mins, handleAlertNeeded);
      setMinutesUntilAlert(mins);

      if (group) {
        try {
          await setDMS(group.groupId, mins);
        } catch (err) {
          console.warn('[DMS] Failed to update interval on server:', err);
        }
      }
    }
  };

  // ── Modal: user is OK → check in and reset server timer ─────────────────
  const handleOK = async () => {
    setModalVisible(false);
    DeadMansSwitchService.checkIn();
    setMinutesUntilAlert(intervalMinutes);

    if (group) {
      try {
        await disableDMS();
        await setDMS(group.groupId, intervalMinutes);
      } catch (err) {
        console.warn('[DMS] Failed to reset after check-in:', err);
      }
    }
  };

  // ── Modal: snooze 15 min ─────────────────────────────────────────────────
  const handleSnooze = async () => {
    setModalVisible(false);
    DeadMansSwitchService.snooze(15);

    try {
      await snoozeDMS(15);
    } catch (err) {
      console.warn('[DMS] Snooze failed on server:', err);
    }
  };

  // ── Modal: disable DMS entirely ──────────────────────────────────────────
  const handleDisable = async () => {
    setModalVisible(false);
    setDmsEnabled(false);
    DeadMansSwitchService.stop();
    DeadMansSwitchService.stopCrashDetection();

    try {
      await disableDMS();
    } catch (err) {
      console.warn('[DMS] Failed to disable on server:', err);
    }
  };

  // ── Modal: SOS shortcut — navigates to Emergency hub ────────────────────
  const handleSOS = () => {
    setModalVisible(false);
    navigation.navigate('Emergency');
  };

  // ── Modal: 2-min countdown expired → escalate to emergency contacts ───────
  const handleTimeout = async () => {
    setModalVisible(false);

    // Stop DMS after escalation (prevents repeat alerts in the same incident)
    setDmsEnabled(false);
    DeadMansSwitchService.stop();
    DeadMansSwitchService.stopCrashDetection();

    // Escalate: server push + SMS to emergency contacts with GPS
    await DeadMansSwitchService.escalate(group?.groupId ?? null);

    // Sync server state
    try {
      await disableDMS();
    } catch {
      // Non-fatal — escalation already fired
    }
  };

  // ── Clean up service on screen unmount ───────────────────────────────────
  useEffect(() => {
    return () => {
      // If navigating away, leave service running (Safety tab stays mounted);
      // only stop on explicit toggle. The cleanup here is for display timer.
    };
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Dead Man's Switch</Text>
      <Text style={styles.description}>
        If you stop moving for the configured interval, your emergency contacts
        and group receive an automatic alert with your last GPS location.
        Keep hiking and we stay quiet.
      </Text>

      {/* Enable / disable toggle */}
      <View style={styles.toggleRow}>
        <View style={styles.toggleLabels}>
          <Text style={styles.toggleLabel}>Enable DMS</Text>
          <Text style={styles.toggleSub}>
            Activates background movement monitoring
          </Text>
        </View>
        <Switch
          value={dmsEnabled}
          onValueChange={handleToggle}
          trackColor={{ false: colors.textDim, true: colors.accent }}
          thumbColor={dmsEnabled ? '#ffffff' : '#888888'}
        />
      </View>

      {/* Interval picker + active status (only shown when DMS is on) */}
      {dmsEnabled && (
        <>
          <Text style={styles.sectionLabel}>ALERT IF NO MOVEMENT FOR</Text>

          <View style={styles.intervalRow}>
            {DMS_INTERVALS.map(mins => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.intervalBtn,
                  intervalMinutes === mins && styles.intervalBtnActive,
                ]}
                onPress={() => void handleIntervalChange(mins)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.intervalBtnText,
                    intervalMinutes === mins && styles.intervalBtnTextActive,
                  ]}
                >
                  {mins === 60 ? '1hr' : `${mins}m`}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Live status card */}
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>
              🟢  Active — alerts in {minutesUntilAlert} min if you stop moving
            </Text>
            <Text style={styles.statusSub}>
              Emergency contacts notified if no response in 2 min
            </Text>
          </View>
        </>
      )}

      {/* Emergency shortcut (opens full emergency hub) */}
      <TouchableOpacity
        style={styles.sosBtn}
        onPress={() => navigation.navigate('Emergency')}
        activeOpacity={0.85}
      >
        <Text style={styles.sosBtnText}>🆘  Emergency</Text>
      </TouchableOpacity>

      {/* DMS alert modal */}
      <DeadMansSwitchModal
        visible={modalVisible}
        onOK={() => void handleOK()}
        onSnooze={() => void handleSnooze()}
        onDisable={() => void handleDisable()}
        onSOS={handleSOS}
        onTimeout={() => void handleTimeout()}
      />
    </ScrollView>
  );
}

// ─── SafetyScreen (stack root) ────────────────────────────────────────────

/**
 * Safety tab root navigator.
 * DMSSettings is the initial screen; SOSMain is one level deeper.
 */
export default function SafetyScreen() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="DMSSettings" component={DMSSettingsScreen} />
      <Stack.Screen
        name="Emergency"
        component={EmergencyScreen}
        options={{ title: 'Emergency', headerShown: true }}
      />
      <Stack.Screen name="SOSMain" component={SOSScreen} />
      <Stack.Screen
        name="EmergencyInfo"
        component={EmergencyInfoScreen}
        options={{ title: 'Emergency Info', headerShown: true }}
      />
    </Stack.Navigator>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 48,
    flexGrow: 1,
  },
  heading: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '800',
    marginBottom: 10,
  },
  description: {
    color: colors.textDim,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: 32,
  },

  // Toggle row
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 28,
  },
  toggleLabels: {
    flex: 1,
    marginRight: 16,
  },
  toggleLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  toggleSub: {
    color: colors.textDim,
    fontSize: 12,
  },

  // Section label
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },

  // Interval picker (3 options: 15m / 30m / 1hr)
  intervalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  intervalBtn: {
    flex: 1,
    marginHorizontal: 4,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  intervalBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  intervalBtnText: {
    color: colors.textDim,
    fontSize: 15,
    fontWeight: '600',
  },
  intervalBtnTextActive: {
    color: '#ffffff',
  },

  // Active status card
  statusCard: {
    backgroundColor: '#071a0f',
    borderWidth: 1,
    borderColor: colors.success,
    borderRadius: 10,
    padding: 14,
    marginBottom: 40,
  },
  statusText: {
    color: colors.success,
    fontSize: 14,
    fontWeight: '600',
  },
  statusSub: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 5,
  },

  // SOS shortcut
  sosBtn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 'auto',
  },
  sosBtnText: {
    color: colors.danger,
    fontSize: 17,
    fontWeight: '700',
  },
});
