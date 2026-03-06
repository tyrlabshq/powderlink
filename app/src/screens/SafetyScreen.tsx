/**
 * SafetyScreen — PL-07 (expanded from PL-04)
 *
 * Stack navigator for the Safety tab:
 *   DMSSettings (initial) → Dead Man's Switch config + active monitoring
 *   SOSMain               → Full SOS screen (unchanged)
 *
 * The Dead Man's Switch is PowderLink's signature safety feature:
 * if a rider stops moving unexpectedly, their group gets an automatic alert.
 */

import React, { useState, useCallback } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';

import SOSScreen from './SOSScreen';
import { colors } from '../theme/colors';
import { useDMSMonitor } from '../hooks/useDMSMonitor';
import DMSModal from '../components/DMSModal';
import { setDMS, snoozeDMS, disableDMS, fireDMSAlert } from '../api/alerts';
import { useGroup } from '../context/GroupContext';

// ─── Navigator ────────────────────────────────────────────────────────────

export type SafetyStackParamList = {
  DMSSettings: undefined;
  SOSMain: undefined;
};

const Stack = createStackNavigator<SafetyStackParamList>();

// ─── Constants ────────────────────────────────────────────────────────────

const INTERVAL_OPTIONS = [5, 10, 15, 20, 30] as const;
type IntervalOption = (typeof INTERVAL_OPTIONS)[number];

// ─── DMSSettings screen ───────────────────────────────────────────────────

function DMSSettingsScreen() {
  const navigation = useNavigation<StackNavigationProp<SafetyStackParamList>>();
  const { group } = useGroup();

  const [dmsEnabled, setDmsEnabled] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState<IntervalOption>(15);
  const [modalVisible, setModalVisible] = useState(false);

  // Stable callback: won't cause useDMSMonitor to remount on every render
  const handleAlertNeeded = useCallback(() => {
    setModalVisible(true);
  }, []);

  const { lastMoved, distanceSinceLast } = useDMSMonitor(
    dmsEnabled,
    intervalMinutes,
    handleAlertNeeded,
  );

  // ── Toggle DMS on / off ─────────────────────────────────────────────────
  const handleToggle = async (enabled: boolean) => {
    setDmsEnabled(enabled);
    if (enabled) {
      if (group) {
        try {
          await setDMS(group.groupId, intervalMinutes);
        } catch (err) {
          console.warn('[DMS] Failed to activate on server:', err);
        }
      }
    } else {
      try {
        await disableDMS();
      } catch (err) {
        console.warn('[DMS] Failed to disable on server:', err);
      }
    }
  };

  // ── Change alert interval ───────────────────────────────────────────────
  const handleIntervalChange = async (mins: IntervalOption) => {
    setIntervalMinutes(mins);
    if (dmsEnabled && group) {
      try {
        await setDMS(group.groupId, mins);
      } catch (err) {
        console.warn('[DMS] Failed to update interval on server:', err);
      }
    }
  };

  // ── Modal actions ───────────────────────────────────────────────────────

  const handleOK = async () => {
    setModalVisible(false);
    // Reset: disable then immediately re-enable to restart the server-side timer
    if (group) {
      try {
        await disableDMS();
        await setDMS(group.groupId, intervalMinutes);
      } catch (err) {
        console.warn('[DMS] Failed to reset after OK:', err);
      }
    }
  };

  const handleSnooze = async () => {
    setModalVisible(false);
    try {
      await snoozeDMS(15);
    } catch (err) {
      console.warn('[DMS] Snooze failed:', err);
    }
  };

  const handleSOS = () => {
    setModalVisible(false);
    navigation.navigate('SOSMain');
  };

  const handleTimeout = async () => {
    setModalVisible(false);
    // Fire app-side alert immediately; server watchdog will fire independently too
    if (group) {
      try {
        const lastLocRaw = await AsyncStorage.getItem('lastLocation');
        let lat: number | undefined;
        let lng: number | undefined;
        if (lastLocRaw) {
          const loc = JSON.parse(lastLocRaw) as { lat: number; lng: number };
          lat = loc.lat;
          lng = loc.lng;
        }
        await fireDMSAlert({ groupId: group.groupId, lat, lng });
      } catch (err) {
        // Non-fatal: the server-side watchdog (checkDMS cron) is the backstop
        console.warn('[DMS] App-side fire failed — server watchdog will catch it:', err);
      }
    }
  };

  // ── Derived display values ──────────────────────────────────────────────
  const minutesUntilAlert = lastMoved
    ? Math.max(0, intervalMinutes - Math.round((Date.now() - lastMoved.getTime()) / 60_000))
    : intervalMinutes;

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.heading}>Dead Man's Switch</Text>
      <Text style={styles.description}>
        If you stop moving for the configured interval, your group receives an
        automatic alert. Keep riding and we'll stay quiet. Stop unexpectedly
        and we call for help.
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

      {/* Interval picker + active status — only when DMS is on */}
      {dmsEnabled && (
        <>
          <Text style={styles.sectionLabel}>ALERT IF NO MOVEMENT FOR</Text>

          <View style={styles.intervalRow}>
            {INTERVAL_OPTIONS.map(mins => (
              <TouchableOpacity
                key={mins}
                style={[
                  styles.intervalBtn,
                  intervalMinutes === mins && styles.intervalBtnActive,
                ]}
                onPress={() => handleIntervalChange(mins)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.intervalBtnText,
                    intervalMinutes === mins && styles.intervalBtnTextActive,
                  ]}
                >
                  {mins}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Live status card */}
          <View style={styles.statusCard}>
            <Text style={styles.statusText}>
              🟢  Active — alerts in {minutesUntilAlert} min if you stop moving
            </Text>
            {distanceSinceLast > 0 && (
              <Text style={styles.statusSub}>
                {distanceSinceLast}m from last movement checkpoint
              </Text>
            )}
          </View>
        </>
      )}

      {/* SOS shortcut at the bottom */}
      <TouchableOpacity
        style={styles.sosBtn}
        onPress={() => navigation.navigate('SOSMain')}
        activeOpacity={0.85}
      >
        <Text style={styles.sosBtnText}>🆘  SOS</Text>
      </TouchableOpacity>

      {/* DMS modal — shown when movement alert triggers */}
      <DMSModal
        visible={modalVisible}
        onOK={handleOK}
        onSnooze={handleSnooze}
        onSOS={handleSOS}
        onTimeout={handleTimeout}
      />
    </ScrollView>
  );
}

// ─── SafetyScreen (stack root) ────────────────────────────────────────────

/**
 * Safety tab root navigator.
 * DMSSettings is the initial screen; SOSMain is one step deeper in the stack.
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
      <Stack.Screen name="SOSMain" component={SOSScreen} />
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

  // Interval picker
  intervalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  intervalBtn: {
    flex: 1,
    marginHorizontal: 3,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.textDim,
    alignItems: 'center',
  },
  intervalBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  intervalBtnText: {
    color: colors.textDim,
    fontSize: 14,
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
