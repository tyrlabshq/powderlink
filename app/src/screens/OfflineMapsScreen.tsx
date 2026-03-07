/**
 * Offline Maps Screen — Profile > Offline Maps
 *
 * Features:
 * - Select from preset snowmobile regions
 * - See estimated download size before confirming
 * - Progress bar during download
 * - List and delete downloaded regions
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { colors } from '../theme/colors';
import {
  PRESET_REGIONS,
  estimateSizeMB,
  downloadRegion,
  listDownloadedRegions,
  deleteRegion,
  type OfflineRegion,
  type OfflinePack,
} from '../services/offlineMaps';

// ---------------------------------------------------------------------------
// Progress bar
// ---------------------------------------------------------------------------
function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.max(2, pct)}%` }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Downloaded region row
// ---------------------------------------------------------------------------
function DownloadedRow({
  pack,
  onDelete,
}: {
  pack: OfflinePack;
  onDelete: (name: string) => void;
}) {
  const name = pack.name ?? 'Region';
  const preset = PRESET_REGIONS.find((p) => p.region.name === name);
  const label = preset?.label ?? name;

  return (
    <View style={styles.downloadedRow}>
      <View style={{ flex: 1 }}>
        <Text style={styles.downloadedName}>{label}</Text>
        <Text style={styles.downloadedSub}>✅ Downloaded</Text>
      </View>
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() =>
          Alert.alert('Delete Region', `Remove offline data for "${label}"?`, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => onDelete(name) },
          ])
        }
      >
        <Text style={styles.deleteBtnText}>🗑</Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
export default function OfflineMapsScreen() {
  const [downloaded, setDownloaded] = useState<OfflinePack[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [confirmRegion, setConfirmRegion] = useState<{
    label: string;
    region: OfflineRegion;
    sizeMB: number;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const packs = await listDownloadedRegions();
    setDownloaded(packs);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const downloadedNames = new Set(downloaded.map((p) => p.name));

  const handleSelectPreset = (label: string, region: OfflineRegion) => {
    if (downloadedNames.has(region.name)) {
      Alert.alert('Already Downloaded', `"${label}" is already available offline.`);
      return;
    }
    const sizeMB = estimateSizeMB(region.bounds, region.minZoom, region.maxZoom);
    setConfirmRegion({ label, region, sizeMB });
  };

  const handleConfirmDownload = async () => {
    if (!confirmRegion) return;
    setConfirmRegion(null);
    setDownloading(confirmRegion.label);
    setProgress(0);

    try {
      await downloadRegion(confirmRegion.region, (pct) => setProgress(pct));
      Alert.alert('✅ Downloaded', `"${confirmRegion.label}" is now available offline.`);
    } catch (err: any) {
      Alert.alert('Download Failed', err?.message ?? 'Unknown error');
    } finally {
      setDownloading(null);
      setProgress(0);
      refresh();
    }
  };

  const handleDelete = async (name: string) => {
    await deleteRegion(name);
    refresh();
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Downloaded regions ── */}
        <Text style={styles.sectionHeader}>Downloaded Regions</Text>
        {loading ? (
          <ActivityIndicator color={colors.accent} style={{ marginVertical: 16 }} />
        ) : downloaded.length === 0 ? (
          <Text style={styles.empty}>No offline regions yet. Download one below.</Text>
        ) : (
          downloaded.map((pack) => (
            <DownloadedRow key={pack.name} pack={pack} onDelete={handleDelete} />
          ))
        )}

        {/* ── Active download progress ── */}
        {downloading && (
          <View style={styles.downloadingCard}>
            <Text style={styles.downloadingLabel}>⬇ Downloading: {downloading}</Text>
            <ProgressBar pct={progress} />
            <Text style={styles.downloadingPct}>{Math.round(progress)}%</Text>
          </View>
        )}

        {/* ── Preset regions ── */}
        <Text style={[styles.sectionHeader, { marginTop: 24 }]}>Preset Regions</Text>
        <Text style={styles.hint}>
          Select a region to download for offline use. Covers zoom levels 8–15
          (trail detail). ~50–180 MB each.
        </Text>

        {PRESET_REGIONS.map(({ label, region }) => {
          const isDownloaded = downloadedNames.has(region.name);
          const isActive = downloading === label;
          const sizeMB = estimateSizeMB(region.bounds, region.minZoom, region.maxZoom);

          return (
            <TouchableOpacity
              key={region.name}
              style={[styles.presetRow, isDownloaded && styles.presetRowDone]}
              onPress={() => handleSelectPreset(label, region)}
              disabled={!!downloading}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.presetLabel}>{label}</Text>
                <Text style={styles.presetMeta}>~{sizeMB} MB</Text>
              </View>
              {isActive ? (
                <ActivityIndicator color={colors.accent} />
              ) : isDownloaded ? (
                <Text style={styles.doneIcon}>✅</Text>
              ) : (
                <Text style={styles.downloadIcon}>⬇</Text>
              )}
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── Confirmation modal ── */}
      <Modal transparent visible={!!confirmRegion} animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Download Region?</Text>
            <Text style={styles.modalBody}>
              <Text style={{ fontWeight: '700', color: colors.text }}>{confirmRegion?.label}</Text>
              {'\n'}Estimated size: <Text style={{ color: colors.accent }}>{confirmRegion?.sizeMB} MB</Text>
              {'\n\n'}This will download map tiles for offline use at zoom levels 8–15.
              Best done on WiFi.
            </Text>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setConfirmRegion(null)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleConfirmDownload}>
                <Text style={styles.confirmBtnText}>Download</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: 16, paddingTop: 8 },

  sectionHeader: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  hint: {
    color: colors.textDim,
    fontSize: 13,
    marginBottom: 12,
    lineHeight: 18,
  },
  empty: {
    color: colors.textDim,
    fontSize: 14,
    fontStyle: 'italic',
    marginBottom: 12,
  },

  // Downloaded row
  downloadedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,255,136,0.2)',
  },
  downloadedName: { color: colors.text, fontSize: 15, fontWeight: '600' },
  downloadedSub: { color: colors.success, fontSize: 12, marginTop: 2 },
  deleteBtn: { padding: 8 },
  deleteBtnText: { fontSize: 20 },

  // Progress
  downloadingCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  downloadingLabel: { color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 3,
  },
  downloadingPct: { color: colors.textDim, fontSize: 12, marginTop: 4, textAlign: 'right' },

  // Preset rows
  presetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  presetRowDone: { borderColor: 'rgba(0,255,136,0.3)' },
  presetLabel: { color: colors.text, fontSize: 15, fontWeight: '600' },
  presetMeta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
  doneIcon: { fontSize: 20 },
  downloadIcon: { fontSize: 20, color: colors.accent },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 380,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  modalTitle: { color: colors.text, fontSize: 20, fontWeight: '700', marginBottom: 12 },
  modalBody: { color: colors.textDim, fontSize: 14, lineHeight: 22, marginBottom: 20 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
  },
  cancelBtnText: { color: colors.textDim, fontWeight: '600' },
  confirmBtn: {
    flex: 1,
    padding: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
});
