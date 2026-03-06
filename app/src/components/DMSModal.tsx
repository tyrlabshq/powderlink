/**
 * DMSModal — PL-07
 *
 * Full-screen "ARE YOU OK?" modal shown when the Dead Man's Switch triggers.
 * Displays a 30-second countdown with vibration alert. If the rider doesn't
 * respond, onTimeout fires and the group gets notified automatically.
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
import { colors } from '../theme/colors';

const COUNTDOWN_SECONDS = 30;

// 3-pulse vibration pattern: [delay, vibrate, pause, vibrate, pause, vibrate]
const VIBRATION_PATTERN = [0, 400, 200, 400, 200, 400];

export interface DMSModalProps {
  visible: boolean;
  onOK: () => void;
  onSnooze: () => void;
  onSOS: () => void;
  onTimeout: () => void;
}

export default function DMSModal({
  visible,
  onOK,
  onSnooze,
  onSOS,
  onTimeout,
}: DMSModalProps) {
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const onTimeoutRef = useRef(onTimeout);

  // Keep timeout callback ref fresh without restarting effects
  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  // Reset + trigger when modal becomes visible
  useEffect(() => {
    if (!visible) {
      setCountdown(COUNTDOWN_SECONDS);
      return;
    }

    // 3-pulse vibration to wake the rider
    Vibration.vibrate(VIBRATION_PATTERN);

    // Countdown timer
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

  // Pulsing warning icon animation
  useEffect(() => {
    if (!visible) {
      pulseAnim.setValue(1);
      return;
    }

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.25,
          duration: 500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 500,
          useNativeDriver: true,
        }),
      ]),
    );
    pulse.start();
    return () => pulse.stop();
  }, [visible, pulseAnim]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        {/* Animated warning icon */}
        <Animated.Text
          style={[styles.warningIcon, { transform: [{ scale: pulseAnim }] }]}
        >
          ⚠️
        </Animated.Text>

        <Text style={styles.title}>ARE YOU OK?</Text>

        <Text style={styles.subtitle}>
          No movement detected.{'\n'}Alerting group in{' '}
          <Text style={styles.countdownHighlight}>{countdown}</Text> seconds...
        </Text>

        {/* I'M OK — green */}
        <TouchableOpacity
          style={styles.btnOK}
          onPress={onOK}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>✅  I'M OK</Text>
        </TouchableOpacity>

        {/* TAKING A BREAK — yellow/amber */}
        <TouchableOpacity
          style={styles.btnSnooze}
          onPress={onSnooze}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>☕  TAKING A BREAK</Text>
        </TouchableOpacity>

        {/* SOS — red */}
        <TouchableOpacity
          style={styles.btnSOS}
          onPress={onSOS}
          activeOpacity={0.85}
        >
          <Text style={styles.btnText}>🆘  SOS</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  warningIcon: {
    fontSize: 80,
    marginBottom: 28,
  },
  title: {
    color: '#ffffff',
    fontSize: 38,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 16,
  },
  subtitle: {
    color: '#aabbcc',
    fontSize: 18,
    textAlign: 'center',
    lineHeight: 28,
    marginBottom: 52,
  },
  countdownHighlight: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 22,
  },
  btnOK: {
    backgroundColor: colors.success,
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
  },
  btnSnooze: {
    backgroundColor: '#cc8800',
    borderRadius: 14,
    paddingVertical: 18,
    width: '100%',
    alignItems: 'center',
    marginBottom: 14,
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
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
