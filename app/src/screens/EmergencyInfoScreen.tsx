import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '../theme/colors';
import {
  getMyEmergencyInfo,
  saveMyEmergencyInfo,
  EmergencyContact,
  EmergencyInfo,
} from '../api/emergency';

// ─── QR Code (optional — graceful fallback if not installed) ─────────────────
let QRCode: React.ComponentType<{ value: string; size: number; color: string; backgroundColor: string }> | null = null;
try {
  QRCode = require('react-native-qrcode-svg').default;
} catch {
  // Package not installed — QR section will show install prompt
}

const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'];
const API_BASE = 'http://localhost:8420';

export default function EmergencyInfoScreen() {
  const [riderId, setRiderId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const [bloodType, setBloodType] = useState<string | null>(null);
  const [allergies, setAllergies] = useState<string[]>([]);
  const [medications, setMedications] = useState<string[]>([]);
  const [conditions, setConditions] = useState('');
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);

  // Temp input state
  const [newAllergy, setNewAllergy] = useState('');
  const [newMed, setNewMed] = useState('');

  useEffect(() => {
    (async () => {
      const id = await AsyncStorage.getItem('riderId');
      setRiderId(id);
      if (id) {
        try {
          const info = await getMyEmergencyInfo();
          setBloodType(info.bloodType);
          setAllergies(info.allergies);
          setMedications(info.medications);
          setConditions(info.conditions || '');
          setContacts(info.emergencyContacts);
        } catch {
          // Fresh profile
        }
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const info: EmergencyInfo = {
        bloodType,
        allergies,
        medications,
        conditions: conditions || null,
        emergencyContacts: contacts,
      };
      await saveMyEmergencyInfo(info);
      Alert.alert('Saved', 'Emergency info updated.');
    } catch {
      Alert.alert('Error', 'Failed to save. Check your connection.');
    } finally {
      setSaving(false);
    }
  }, [bloodType, allergies, medications, conditions, contacts]);

  const addContact = () => {
    if (contacts.length >= 3) {
      Alert.alert('Limit reached', 'Maximum 3 emergency contacts allowed.');
      return;
    }
    setContacts([...contacts, { name: '', phone: '', relationship: '' }]);
  };

  const updateContact = (idx: number, field: keyof EmergencyContact, value: string) => {
    const updated = [...contacts];
    updated[idx] = { ...updated[idx], [field]: value };
    setContacts(updated);
  };

  const removeContact = (idx: number) => {
    setContacts(contacts.filter((_, i) => i !== idx));
  };

  const emergencyUrl = riderId ? `${API_BASE}/emergency/${riderId}` : null;

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Emergency Info</Text>
      <Text style={styles.subheader}>
        Scanned by first responders if you're in an accident. No login required.
      </Text>

      {/* Blood Type */}
      <Text style={styles.sectionTitle}>Blood Type</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {BLOOD_TYPES.map(bt => (
          <TouchableOpacity
            key={bt}
            style={[styles.chip, bloodType === bt && styles.chipSelected]}
            onPress={() => setBloodType(bt === bloodType ? null : bt)}
          >
            <Text style={[styles.chipText, bloodType === bt && styles.chipTextSelected]}>{bt}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Allergies */}
      <Text style={styles.sectionTitle}>Allergies</Text>
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="e.g. Penicillin"
          placeholderTextColor={colors.textDim}
          value={newAllergy}
          onChangeText={setNewAllergy}
          onSubmitEditing={() => {
            if (newAllergy.trim()) {
              setAllergies([...allergies, newAllergy.trim()]);
              setNewAllergy('');
            }
          }}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (newAllergy.trim()) {
              setAllergies([...allergies, newAllergy.trim()]);
              setNewAllergy('');
            }
          }}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagRow}>
        {allergies.map((a, i) => (
          <TouchableOpacity key={i} style={styles.tagDanger} onPress={() => setAllergies(allergies.filter((_, j) => j !== i))}>
            <Text style={styles.tagText}>{a} ✕</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Medications */}
      <Text style={styles.sectionTitle}>Medications</Text>
      <View style={styles.addRow}>
        <TextInput
          style={styles.addInput}
          placeholder="e.g. Metformin 500mg"
          placeholderTextColor={colors.textDim}
          value={newMed}
          onChangeText={setNewMed}
          onSubmitEditing={() => {
            if (newMed.trim()) {
              setMedications([...medications, newMed.trim()]);
              setNewMed('');
            }
          }}
        />
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => {
            if (newMed.trim()) {
              setMedications([...medications, newMed.trim()]);
              setNewMed('');
            }
          }}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.tagRow}>
        {medications.map((m, i) => (
          <TouchableOpacity key={i} style={styles.tag} onPress={() => setMedications(medications.filter((_, j) => j !== i))}>
            <Text style={styles.tagText}>{m} ✕</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Medical Conditions */}
      <Text style={styles.sectionTitle}>Medical Conditions</Text>
      <TextInput
        style={[styles.addInput, styles.textArea]}
        placeholder="e.g. Type 2 diabetes, heart condition..."
        placeholderTextColor={colors.textDim}
        value={conditions}
        onChangeText={setConditions}
        multiline
        numberOfLines={3}
      />

      {/* Emergency Contacts */}
      <Text style={styles.sectionTitle}>Emergency Contacts (up to 3)</Text>
      {contacts.map((c, i) => (
        <View key={i} style={styles.contactCard}>
          <View style={styles.contactHeader}>
            <Text style={styles.contactLabel}>Contact {i + 1}</Text>
            <TouchableOpacity onPress={() => removeContact(i)}>
              <Text style={styles.removeText}>Remove</Text>
            </TouchableOpacity>
          </View>
          <TextInput
            style={styles.contactInput}
            placeholder="Name"
            placeholderTextColor={colors.textDim}
            value={c.name}
            onChangeText={v => updateContact(i, 'name', v)}
          />
          <TextInput
            style={styles.contactInput}
            placeholder="Phone"
            placeholderTextColor={colors.textDim}
            value={c.phone}
            onChangeText={v => updateContact(i, 'phone', v)}
            keyboardType="phone-pad"
          />
          <TextInput
            style={styles.contactInput}
            placeholder="Relationship (e.g. Spouse)"
            placeholderTextColor={colors.textDim}
            value={c.relationship}
            onChangeText={v => updateContact(i, 'relationship', v)}
          />
        </View>
      ))}
      {contacts.length < 3 && (
        <TouchableOpacity style={styles.addContactBtn} onPress={addContact}>
          <Text style={styles.addContactText}>+ Add Emergency Contact</Text>
        </TouchableOpacity>
      )}

      {/* Save */}
      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveBtnText}>Save Emergency Info</Text>
        )}
      </TouchableOpacity>

      {/* QR Code Section */}
      {emergencyUrl && (
        <View style={styles.qrSection}>
          <Text style={styles.sectionTitle}>QR Code for Helmet/Sled</Text>
          <Text style={styles.subheader}>
            Print this on a sticker. First responders scan it for your medical info — no app needed.
          </Text>
          <TouchableOpacity style={styles.qrToggle} onPress={() => setShowQR(!showQR)}>
            <Text style={styles.qrToggleText}>{showQR ? 'Hide QR Code' : 'Show QR Code'}</Text>
          </TouchableOpacity>

          {showQR && (
            <View style={styles.qrContainer}>
              {QRCode ? (
                <QRCode
                  value={emergencyUrl}
                  size={220}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                />
              ) : (
                <View style={styles.qrFallback}>
                  <Text style={styles.qrFallbackText}>
                    Install react-native-qrcode-svg to show QR code
                  </Text>
                  <Text style={styles.qrUrl}>{emergencyUrl}</Text>
                </View>
              )}
              <Text style={styles.qrUrl}>{emergencyUrl}</Text>
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  header: { color: colors.text, fontSize: 22, fontWeight: '700', marginBottom: 6 },
  subheader: { color: colors.textDim, fontSize: 13, marginBottom: 20, lineHeight: 18 },
  sectionTitle: { color: colors.accent, fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginTop: 20, marginBottom: 10 },
  chipRow: { flexDirection: 'row', marginBottom: 4 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, marginRight: 8 },
  chipSelected: { borderColor: colors.danger, backgroundColor: colors.danger + '22' },
  chipText: { color: colors.textDim, fontSize: 14 },
  chipTextSelected: { color: colors.danger, fontWeight: '700' },
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  addInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: 8, color: colors.text, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, fontSize: 14 },
  textArea: { height: 80, textAlignVertical: 'top' },
  addBtn: { backgroundColor: colors.accent, borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  tag: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 },
  tagDanger: { backgroundColor: '#3a0000', borderWidth: 1, borderColor: colors.danger, borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4 },
  tagText: { color: colors.text, fontSize: 13 },
  contactCard: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: colors.border },
  contactHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  contactLabel: { color: colors.text, fontWeight: '700', fontSize: 14 },
  removeText: { color: colors.danger, fontSize: 13 },
  contactInput: { borderWidth: 1, borderColor: colors.border, borderRadius: 6, color: colors.text, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: colors.background, fontSize: 14, marginBottom: 8 },
  addContactBtn: { borderWidth: 1, borderColor: colors.accent, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 4 },
  addContactText: { color: colors.accent, fontSize: 15, fontWeight: '600' },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 24 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  qrSection: { marginTop: 24 },
  qrToggle: { borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  qrToggleText: { color: colors.text, fontSize: 14 },
  qrContainer: { alignItems: 'center', marginTop: 16, padding: 20, backgroundColor: '#fff', borderRadius: 12 },
  qrFallback: { alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderRadius: 8 },
  qrFallbackText: { color: colors.textDim, fontSize: 13, textAlign: 'center', marginBottom: 8 },
  qrUrl: { color: '#333', fontSize: 11, marginTop: 10, textAlign: 'center' },
});
