/**
 * EmergencyScreen — TG-05
 *
 * Central emergency hub accessible from the Safety tab's SOS shortcut.
 * Consolidates all critical emergency actions in one place:
 *
 *   1. One-tap 911 call (tel: URL via Linking)
 *   2. Share location via SMS — auto-composes message with live GPS coords
 *   3. ICE (In Case of Emergency) contact quick-dial buttons
 *   4. Inline Medical ID card — blood type, allergies, medications
 *
 * GPS resolution order:
 *   a. BackgroundGeolocation.getCurrentPosition (fresh fix, 8s timeout)
 *   b. AsyncStorage 'lastLocation' (cached by LocationService / DMS)
 *   c. 0,0 fallback (user is warned)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Linking,
  ActivityIndicator,
  Animated,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import type { SafetyStackParamList } from './SafetyScreen';
import { colors } from '../theme/colors';
import { getMyEmergencyInfo, EmergencyContact, EmergencyInfo } from '../api/emergency';

// ─── GPS helper ────────────────────────────────────────────────────────────

async function getCurrentLocation(): Promise<{ lat: number; lng: number; fresh: boolean }> {
  // Try BackgroundGeolocation for a fresh GPS fix (8s timeout)
  try {
    const BackgroundGeolocation = require('react-native-background-geolocation').default;
    const location = await Promise.race<{ lat: number; lng: number; fresh: boolean }>([
      BackgroundGeolocation.getCurrentPosition({ samples: 1, persist: false, timeout: 8 }).then(
        (loc: any) => ({
          lat: loc.coords.latitude,
          lng: loc.coords.longitude,
          fresh: true,
        })
      ),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 9000)),
    ]);
    return location;
  } catch {
    // Fall back to cached location
  }

  try {
    const raw = await AsyncStorage.getItem('lastLocation');
    if (raw) {
      const loc = JSON.parse(raw);
      return { lat: loc.lat, lng: loc.lng, fresh: false };
    }
  } catch {}

  return { lat: 0, lng: 0, fresh: false };
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function EmergencyScreen() {
  const navigation = useNavigation<StackNavigationProp<SafetyStackParamList>>();

  const [emergencyInfo, setEmergencyInfo] = useState<EmergencyInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);

  // Pulsing animation for the 911 button
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  useEffect(() => {
    getMyEmergencyInfo()
      .then(info => setEmergencyInfo(info))
      .catch(() => setEmergencyInfo(null))
      .finally(() => setLoading(false));
  }, []);

  // ── 911 call ──────────────────────────────────────────────────────────────
  const handle911 = useCallback(() => {
    Alert.alert(
      '📞 Call 911?',
      'This will open your phone dialer to call 911.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call 911',
          style: 'destructive',
          onPress: () => Linking.openURL('tel:911'),
        },
      ]
    );
  }, []);

  // ── Share location via SMS ─────────────────────────────────────────────
  const handleShareLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { lat, lng, fresh } = await getCurrentLocation();
      const hasCoords = lat !== 0 || lng !== 0;

      let mapsLink = 'Location unavailable';
      if (hasCoords) {
        mapsLink = `https://maps.google.com/?q=${lat.toFixed(6)},${lng.toFixed(6)}`;
      }

      const staleness = !fresh && hasCoords ? ' (last known)' : '';
      const body = `🚨 I need help! My location${staleness}: ${mapsLink}\n— Sent via TrailGuard`;
      const smsUrl = `sms:?body=${encodeURIComponent(body)}`;

      await Linking.openURL(smsUrl);
    } catch {
      Alert.alert('Error', 'Could not open SMS. Please manually share your location.');
    } finally {
      setLocating(false);
    }
  }, []);

  // ── ICE contact quick-dial ────────────────────────────────────────────
  const handleDialContact = useCallback((contact: EmergencyContact) => {
    if (!contact.phone) {
      Alert.alert('No phone number', 'This contact has no phone number saved.');
      return;
    }
    Alert.alert(
      `Call ${contact.name}?`,
      `${contact.relationship ? contact.relationship + ' · ' : ''}${contact.phone}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Call',
          onPress: () => Linking.openURL(`tel:${contact.phone}`),
        },
      ]
    );
  }, []);

  // ── SOS (full alert) ─────────────────────────────────────────────────
  const handleFullSOS = useCallback(() => {
    navigation.navigate('SOSMain');
  }, [navigation]);

  // ─── Render ───────────────────────────────────────────────────────────

  const contacts = emergencyInfo?.emergencyContacts ?? [];
  const hasContacts = contacts.filter(c => c.name || c.phone).length > 0;

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header */}
      <Text style={styles.header}>Emergency</Text>
      <Text style={styles.subheader}>
        One tap to get help. Stay calm.
      </Text>

      {/* ── 911 Button ── */}
      <View style={styles.section}>
        <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
          <TouchableOpacity
            style={styles.btn911}
            onPress={handle911}
            activeOpacity={0.85}
          >
            <Text style={styles.btn911Icon}>📞</Text>
            <Text style={styles.btn911Text}>Call 911</Text>
            <Text style={styles.btn911Sub}>One tap · Emergency services</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

      {/* ── Share Location ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>SHARE YOUR LOCATION</Text>
        <TouchableOpacity
          style={styles.locationBtn}
          onPress={handleShareLocation}
          disabled={locating}
          activeOpacity={0.8}
        >
          {locating ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <Text style={styles.locationBtnIcon}>📍</Text>
              <View style={styles.locationBtnTextBlock}>
                <Text style={styles.locationBtnTitle}>Send My Location via SMS</Text>
                <Text style={styles.locationBtnSub}>
                  Opens SMS composer with Google Maps link
                </Text>
              </View>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* ── ICE Contacts ── */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>ICE CONTACTS</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
        ) : hasContacts ? (
          contacts
            .filter(c => c.name || c.phone)
            .map((contact, i) => (
              <TouchableOpacity
                key={i}
                style={styles.contactCard}
                onPress={() => handleDialContact(contact)}
                activeOpacity={0.8}
              >
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name || 'Unnamed contact'}</Text>
                  {contact.relationship ? (
                    <Text style={styles.contactRel}>{contact.relationship}</Text>
                  ) : null}
                  <Text style={styles.contactPhone}>{contact.phone || 'No number'}</Text>
                </View>
                <View style={styles.dialBtn}>
                  <Text style={styles.dialBtnIcon}>📞</Text>
                  <Text style={styles.dialBtnText}>Dial</Text>
                </View>
              </TouchableOpacity>
            ))
        ) : (
          <TouchableOpacity
            style={styles.noContactsCard}
            onPress={() => navigation.navigate('EmergencyInfo')}
            activeOpacity={0.8}
          >
            <Text style={styles.noContactsText}>
              ⚠️ No ICE contacts saved.{'\n'}Tap here to add emergency contacts.
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Medical ID ── */}
      <View style={styles.section}>
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>MEDICAL ID</Text>
          <TouchableOpacity onPress={() => navigation.navigate('EmergencyInfo')}>
            <Text style={styles.editLink}>Edit</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
        ) : emergencyInfo ? (
          <View style={styles.medicalCard}>
            {/* Blood type */}
            <View style={styles.medRow}>
              <Text style={styles.medLabel}>Blood Type</Text>
              <Text style={[styles.medValue, styles.medValueHighlight]}>
                {emergencyInfo.bloodType ?? 'Unknown'}
              </Text>
            </View>

            {/* Allergies */}
            {emergencyInfo.allergies.length > 0 && (
              <View style={styles.medRow}>
                <Text style={styles.medLabel}>Allergies</Text>
                <Text style={[styles.medValue, styles.medValueDanger]}>
                  {emergencyInfo.allergies.join(', ')}
                </Text>
              </View>
            )}

            {/* Medications */}
            {emergencyInfo.medications.length > 0 && (
              <View style={styles.medRow}>
                <Text style={styles.medLabel}>Medications</Text>
                <Text style={styles.medValue}>
                  {emergencyInfo.medications.join(', ')}
                </Text>
              </View>
            )}

            {/* Medical conditions */}
            {emergencyInfo.conditions ? (
              <View style={styles.medRow}>
                <Text style={styles.medLabel}>Conditions</Text>
                <Text style={styles.medValue}>{emergencyInfo.conditions}</Text>
              </View>
            ) : null}

            {/* Empty state within card */}
            {!emergencyInfo.bloodType &&
              emergencyInfo.allergies.length === 0 &&
              emergencyInfo.medications.length === 0 &&
              !emergencyInfo.conditions && (
                <Text style={styles.medEmptyText}>
                  No medical info saved. Tap Edit to add.
                </Text>
              )}
          </View>
        ) : (
          <TouchableOpacity
            style={styles.noContactsCard}
            onPress={() => navigation.navigate('EmergencyInfo')}
            activeOpacity={0.8}
          >
            <Text style={styles.noContactsText}>
              Could not load medical info.{'\n'}Tap to set up Emergency Info.
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Full SOS ── */}
      <View style={styles.section}>
        <TouchableOpacity
          style={styles.sosBtn}
          onPress={handleFullSOS}
          activeOpacity={0.85}
        >
          <Text style={styles.sosBtnText}>🆘  Fire Full SOS Alert</Text>
          <Text style={styles.sosBtnSub}>Alerts group + texts all emergency contacts</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 24,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  header: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '800',
    marginBottom: 4,
  },
  subheader: {
    color: colors.textDim,
    fontSize: 14,
    marginBottom: 24,
  },
  section: {
    marginBottom: 28,
  },
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  editLink: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // 911 button
  btn911: {
    backgroundColor: '#cc0000',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    shadowColor: '#ff0000',
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  btn911Icon: {
    fontSize: 36,
    marginBottom: 6,
  },
  btn911Text: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
  },
  btn911Sub: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 4,
  },

  // Location share button
  locationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    minHeight: 60,
  },
  locationBtnIcon: {
    fontSize: 28,
    marginRight: 14,
  },
  locationBtnTextBlock: {
    flex: 1,
  },
  locationBtnTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  locationBtnSub: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 2,
  },

  // ICE contact cards
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  contactRel: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 1,
  },
  contactPhone: {
    color: colors.accentAlt,
    fontSize: 14,
    marginTop: 3,
  },
  dialBtn: {
    backgroundColor: colors.success,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: 64,
  },
  dialBtnIcon: {
    fontSize: 18,
  },
  dialBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },

  // No contacts / error card
  noContactsCard: {
    backgroundColor: '#1a1000',
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: 10,
    padding: 16,
  },
  noContactsText: {
    color: colors.warning,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Medical ID card
  medicalCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  medRow: {
    flexDirection: 'row',
    marginBottom: 10,
    flexWrap: 'wrap',
  },
  medLabel: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '600',
    width: 100,
    marginTop: 1,
  },
  medValue: {
    color: colors.text,
    fontSize: 14,
    flex: 1,
    flexWrap: 'wrap',
  },
  medValueHighlight: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 16,
  },
  medValueDanger: {
    color: colors.danger,
    fontWeight: '600',
  },
  medEmptyText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 8,
  },

  // Full SOS button
  sosBtn: {
    borderWidth: 1.5,
    borderColor: colors.danger,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  sosBtnText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '700',
  },
  sosBtnSub: {
    color: colors.textDim,
    fontSize: 12,
    marginTop: 4,
  },
});
