/**
 * DeadMansSwitchModal — TG-03
 *
 * Full-screen "ARE YOU OK?" modal shown when the Dead Man's Switch alert fires.
 *
 * Features:
 *  - 2-minute (120s) countdown before auto-escalation to emergency contacts
 *  - Strong vibration pattern on show (haptic alert)
 *  - Four user actions: I'm OK / Snooze 15 min / Disable DMS / SOS
 *  - Pulsing warning animation
 *  - Auto-calls onTimeout when countdown reaches zero
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Vibration,
  Animated,
} from 'react-native';
import { ESCALATION_TIMEOUT_MS } from '../services/DeadMansSwitchService';
import { colors } from '../theme/colors';

// ─── Constants ─────────────────────────────────────────────────────────────

const COUNTDOWN_SECONDS = Math.round(ESCALATION_TIMEOUT_MS / 1_000); // 120

/**
 * Haptic alert pattern: three strong pulses then a sustained final buzz.
 * [delay, on, off, on, off, on, off, on]
 */
const HAPTIC_PATTERN = [0, 600, 150, 600, 150, 600, 200, 1_200];

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DeadMansSwitchModalProps {
  /** Whether the modal is shown. */
  visible: boolean;
  /** User confirmed they're OK — restart the DMS interval. */
  onOK: () => void;
  /** User is taking a break — snooze for 15 min. */
  onSnooze: () => void;
  /** User wants to disable DMS entirely. */
  onDisable: () => void;
  /** User wants to fire SOS — navigate to SOS screen. */
  onSOS: () => void;
  /** Countdown expired with no response — escalate to emergency contacts. */
  onTimeout: () => void;
}

// ─── Component ─────────────────────────────────────────────────────────────

export default function DeadMansSwitchModal({
  visible,
  onOK,
  onSnooze,
  onDisable,
  onSOS,
  onTimeout,
}: DeadMansSwitchModalProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  // Keep onTimeout ref fresh so the interval closure never stales
  const onTimeoutRef = useRef(onTimeout);
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // ── Reset, vibrate, and start countdown when modal becomes visible ────────
  useEffect(() => {
    if (!visible) {
      setCountdown(COUNTDOWN_SECONDS);
      return;
    }

    // Haptic alert on appearance
    Vibration.vibrate(HAPTIC_PATTERN);
    setCountdown(COUNTDOWN_SECONDS);

    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          onTimeoutRef.current();
          return 0;
        }
        return prev - 1;
      });
    }, 1_000);

    return () => clearInterval(timer);
  }, [visible]);

  // ── Pulsing warning icon ──────────────────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      pulseAnim.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.3,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible, pulseAnim]);

  // ── Countdown colour: green → amber → red as time runs out ───────────────
  const urgencyColor = (): string => {
    if (countdown > 90) return colors.success;
    if (countdown > 30) return colors.warning;
    return colors.danger;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Pulsing warning icon */}
        <Animated.Text
          style={[styles.warningIcon, { transform: [{ scale: pulseAnim }] }]}
        >
          ⚠️
        </Animated.Text>

        <Text style={styles.title}>ARE YOU OK?</Text>

        <Text style={styles.subtitle}>
          No movement detected.{'\n'}
          Emergency contacts alerted in{' '}
          <Text style={[styles.countdown, { color: urgencyColor() }]}>
            {countdown}
          </Text>{' '}
          seconds
        </Text>

        {/* I'M OK — primary action, green */}
        <TouchableOpacity
          style={styles.btnOK}
          onPress={onOK}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>✅  I'M OK — CHECK IN</Text>
        </TouchableOpacity>

        {/* SNOOZE — amber */}
        <TouchableOpacity
          style={styles.btnSnooze}
          onPress={onSnooze}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>☕  TAKING A BREAK (15 min)</Text>
        </TouchableOpacity>

        {/* DISABLE DMS — grey */}
        <TouchableOpacity
          style={styles.btnDisable}
          onPress={onDisable}
          activeOpacity={0.85}
        >
          <Text style={styles.btnTextSecondary}>⛔  DISABLE DEAD MAN'S SWITCH</Text>
        </TouchableOpacity>

        {/* SOS — red, always last */}
        <TouchableOpacity
          style={styles.btnSOS}
          onPress={onSOS}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>🆘  SOS EMERGENCY</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.97)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  warningIcon: {
    fontSize: 88,
    marginBottom: 24,
  },
  title: {
    color: '#ffffff',
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    color: '#aabbcc',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 48,
  },
  countdown: {
    fontWeight: '900',
    fontSize: 24,
  },

  // Buttons
  btnOK: {
    backgroundColor: colors.success,
    borderRadius: 14,
    paddingVertical: 20,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnSnooze: {
    backgroundColor: '#cc8800',
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnDisable: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 16,
    width: '100%',
    alignItems: 'center',
    marginBottom: 12,
  },
  btnSOS: {
    backgroundColor: colors.danger,
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
  },
  btnText: {
    color: '#ffffff',
    fontSize: 17,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  btnTextSecondary: {
    color: colors.textDim,
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
