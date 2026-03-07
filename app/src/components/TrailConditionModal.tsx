import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import {
  reportCondition,
  reportHazard,
  reportSnowDepth,
  CONDITION_LABELS,
  CONDITION_ICONS,
  CONDITION_COLORS,
  HAZARD_LABELS,
  HAZARD_ICONS,
  HAZARD_COLORS,
  type ConditionType,
  type HazardType,
  type ReportType,
} from '../api/trailConditions';
import { colors } from '../theme/colors';

const CONDITION_TYPES: ConditionType[] = ['groomed', 'powder', 'icy', 'tracked_out', 'wet_snow', 'closed'];
const HAZARD_TYPES: HazardType[] = ['downed_tree', 'washout', 'bridge_out', 'debris', 'flooding', 'rock_slide'];

interface TrailConditionModalProps {
  visible: boolean;
  userLat: number | null;
  userLng: number | null;
  onClose: () => void;
  onSubmitted: () => void;
}

export function TrailConditionModal({
  visible,
  userLat,
  userLng,
  onClose,
  onSubmitted,
}: TrailConditionModalProps) {
  const [reportType, setReportType] = useState<ReportType>('condition');
  const [selectedCondition, setSelectedCondition] = useState<ConditionType | null>(null);
  const [selectedHazard, setSelectedHazard] = useState<HazardType | null>(null);
  const [snowDepth, setSnowDepth] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  function reset() {
    setReportType('condition');
    setSelectedCondition(null);
    setSelectedHazard(null);
    setSnowDepth('');
    setNotes('');
  }

  function handleClose() {
    reset();
    onClose();
  }

  function isSubmitDisabled(): boolean {
    if (loading) return true;
    if (reportType === 'condition' && !selectedCondition) return true;
    if (reportType === 'hazard' && !selectedHazard) return true;
    if (reportType === 'snow_depth') {
      const depth = parseFloat(snowDepth);
      if (isNaN(depth) || depth <= 0 || depth > 999) return true;
    }
    return false;
  }

  async function handleSubmit() {
    if (userLat === null || userLng === null) {
      Alert.alert('Location unavailable', 'Enable location to report trail conditions.');
      return;
    }
    setLoading(true);
    try {
      if (reportType === 'condition' && selectedCondition) {
        await reportCondition(userLat, userLng, selectedCondition, notes.trim() || undefined);
      } else if (reportType === 'hazard' && selectedHazard) {
        await reportHazard(userLat, userLng, selectedHazard, notes.trim() || undefined);
      } else if (reportType === 'snow_depth') {
        const depth = parseFloat(snowDepth);
        await reportSnowDepth(userLat, userLng, depth, notes.trim() || undefined);
      }
      reset();
      onSubmitted();
      onClose();
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  }

  const TAB_LABELS: Record<ReportType, string> = {
    condition: '❄️ Condition',
    hazard: '⚠️ Hazard',
    snow_depth: '📏 Snow',
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <Text style={styles.title}>Report Trail Conditions</Text>
          <Text style={styles.subtitle}>
            {userLat !== null ? '📍 Using your current location' : '⚠️ Location not available'}
          </Text>

          {/* Report Type Tabs */}
          <View style={styles.tabs}>
            {(['condition', 'hazard', 'snow_depth'] as ReportType[]).map((type) => (
              <TouchableOpacity
                key={type}
                style={[styles.tab, reportType === type && styles.tabActive]}
                onPress={() => setReportType(type)}
              >
                <Text style={[styles.tabText, reportType === type && styles.tabTextActive]}>
                  {TAB_LABELS[type]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} style={styles.scroll}>
            {/* ── Trail Condition Tab ── */}
            {reportType === 'condition' && (
              <>
                <Text style={styles.sectionLabel}>CONDITION TYPE</Text>
                <View style={styles.grid}>
                  {CONDITION_TYPES.map((type) => {
                    const isActive = selectedCondition === type;
                    const color = CONDITION_COLORS[type];
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.conditionBtn,
                          isActive && { borderColor: color, backgroundColor: color + '22' },
                        ]}
                        onPress={() => setSelectedCondition(type)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.conditionIcon}>{CONDITION_ICONS[type]}</Text>
                        <Text style={[styles.conditionLabel, isActive && { color }]}>
                          {CONDITION_LABELS[type]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            {/* ── Hazard Tab ── */}
            {reportType === 'hazard' && (
              <>
                <Text style={styles.sectionLabel}>HAZARD TYPE</Text>
                <View style={styles.grid}>
                  {HAZARD_TYPES.map((type) => {
                    const isActive = selectedHazard === type;
                    const color = HAZARD_COLORS[type];
                    return (
                      <TouchableOpacity
                        key={type}
                        style={[
                          styles.conditionBtn,
                          isActive && { borderColor: color, backgroundColor: color + '22' },
                        ]}
                        onPress={() => setSelectedHazard(type)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.conditionIcon}>{HAZARD_ICONS[type]}</Text>
                        <Text style={[styles.conditionLabel, isActive && { color }]}>
                          {HAZARD_LABELS[type]}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                {/* Photo Placeholder */}
                <TouchableOpacity
                  style={styles.photoBtn}
                  onPress={() => Alert.alert('📸 Photo Upload', 'Photo upload coming in next update — attach trail condition photos from your camera roll.')}
                >
                  <Text style={styles.photoIcon}>📷</Text>
                  <Text style={styles.photoBtnText}>Add Photo (Coming Soon)</Text>
                </TouchableOpacity>
              </>
            )}

            {/* ── Snow Depth Tab ── */}
            {reportType === 'snow_depth' && (
              <>
                <Text style={styles.sectionLabel}>SNOW DEPTH</Text>
                <View style={styles.snowInputRow}>
                  <TextInput
                    style={styles.snowInput}
                    value={snowDepth}
                    onChangeText={setSnowDepth}
                    placeholder="0"
                    placeholderTextColor={colors.textDim}
                    keyboardType="numeric"
                    maxLength={4}
                  />
                  <Text style={styles.snowUnit}>cm</Text>
                </View>
                <Text style={styles.snowHint}>
                  Measure at the trailhead or a representative open area
                </Text>
              </>
            )}

            {/* Notes — shared across all tabs */}
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>NOTE (optional)</Text>
            <TextInput
              style={styles.noteInput}
              value={notes}
              onChangeText={setNotes}
              placeholder={
                reportType === 'condition'
                  ? 'e.g. fresh overnight — perfect on north side'
                  : reportType === 'hazard'
                  ? 'e.g. large pine across main loop near mile marker 4'
                  : 'e.g. measured at trailhead kiosk, 8am'
              }
              placeholderTextColor={colors.textDim}
              maxLength={200}
              multiline
              numberOfLines={2}
              autoCapitalize="sentences"
            />

            {/* Open / All riders banner */}
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                🌍 Reports are visible to ALL riders — not just one brand
              </Text>
            </View>

            <View style={styles.actions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={handleClose}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.submitBtn, isSubmitDisabled() && styles.submitBtnDisabled]}
                onPress={handleSubmit}
                disabled={isSubmitDisabled()}
              >
                {loading ? (
                  <ActivityIndicator color="#000" />
                ) : (
                  <Text style={styles.submitBtnText}>Submit Report</Text>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 8,
    maxHeight: '90%',
  },
  scroll: {
    flexGrow: 0,
  },
  handle: {
    width: 36,
    height: 4,
    backgroundColor: colors.textDim,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
    opacity: 0.4,
  },
  title: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 16,
  },
  // Tabs
  tabs: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 3,
    marginBottom: 20,
    gap: 3,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
  },
  tabActive: {
    backgroundColor: colors.accent,
  },
  tabText: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#000',
    fontWeight: '700',
  },
  // Grid
  sectionLabel: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 10,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 16,
  },
  conditionBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.18)',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    minWidth: '29%',
    flex: 1,
  },
  conditionIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  conditionLabel: {
    color: colors.textDim,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Photo
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    padding: 12,
    marginBottom: 4,
    gap: 10,
  },
  photoIcon: {
    fontSize: 20,
  },
  photoBtnText: {
    color: colors.textDim,
    fontSize: 14,
    fontWeight: '600',
  },
  // Snow depth
  snowInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  snowInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    padding: 12,
    width: 100,
    textAlign: 'center',
  },
  snowUnit: {
    color: colors.textDim,
    fontSize: 20,
    fontWeight: '600',
  },
  snowHint: {
    color: colors.textDim,
    fontSize: 12,
    marginBottom: 8,
  },
  // Note
  noteInput: {
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 10,
    color: colors.text,
    fontSize: 14,
    padding: 12,
    marginBottom: 16,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  // Banner
  banner: {
    backgroundColor: 'rgba(0,200,100,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0,200,100,0.25)',
    borderRadius: 10,
    padding: 10,
    marginBottom: 20,
  },
  bannerText: {
    color: '#00cc66',
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Actions
  actions: {
    flexDirection: 'row',
    gap: 12,
    paddingBottom: 36,
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
  submitBtn: {
    flex: 2,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitBtnText: {
    color: '#000',
    fontSize: 16,
    fontWeight: '700',
  },
});
