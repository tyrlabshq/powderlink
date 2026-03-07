import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native';
import {
  CONDITION_LABELS,
  CONDITION_ICONS,
  CONDITION_COLORS,
  HAZARD_LABELS,
  HAZARD_ICONS,
  HAZARD_COLORS,
  upvoteReport,
  type TrailConditionReport,
} from '../api/trailConditions';
import { colors } from '../theme/colors';

interface Props {
  visible: boolean;
  reports: TrailConditionReport[];
  onClose: () => void;
  onReportCondition: () => void;
  onUpvote?: (reportId: string) => void;
}

function formatRelativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  if (isNaN(ms) || ms < 0) return 'just now';
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  return `${Math.floor(min / 60)}h ago`;
}

function formatDistance(meters?: number): string {
  if (meters === undefined) return '';
  if (meters < 1000) return `${Math.round(meters)}m away`;
  return `${(meters / 1000).toFixed(1)}km away`;
}

function getReportLabel(report: TrailConditionReport): string {
  if (report.reportType === 'condition' && report.condition) {
    return CONDITION_LABELS[report.condition];
  }
  if (report.reportType === 'hazard' && report.hazard) {
    return HAZARD_LABELS[report.hazard];
  }
  if (report.reportType === 'snow_depth') {
    return `${report.snowDepthCm} cm snow`;
  }
  return 'Unknown';
}

function getReportIcon(report: TrailConditionReport): string {
  if (report.reportType === 'condition' && report.condition) {
    return CONDITION_ICONS[report.condition];
  }
  if (report.reportType === 'hazard' && report.hazard) {
    return HAZARD_ICONS[report.hazard];
  }
  if (report.reportType === 'snow_depth') return '📏';
  return '❓';
}

function getReportColor(report: TrailConditionReport): string {
  if (report.reportType === 'condition' && report.condition) {
    return CONDITION_COLORS[report.condition];
  }
  if (report.reportType === 'hazard' && report.hazard) {
    return HAZARD_COLORS[report.hazard];
  }
  if (report.reportType === 'snow_depth') return '#00aaff';
  return '#888';
}

function getReportTypeBadge(report: TrailConditionReport): string {
  if (report.reportType === 'hazard') return '⚠️ HAZARD';
  if (report.reportType === 'snow_depth') return '📏 SNOW DEPTH';
  return '';
}

interface ReportRowProps {
  item: TrailConditionReport;
  onUpvote: (id: string) => void;
}

function ReportRow({ item, onUpvote }: ReportRowProps) {
  const [upvotes, setUpvotes] = useState(item.upvotes);
  const [hasUpvoted, setHasUpvoted] = useState(item.userHasUpvoted);
  const color = getReportColor(item);
  const badge = getReportTypeBadge(item);

  async function handleUpvote() {
    if (hasUpvoted) return;
    setUpvotes((n) => n + 1);
    setHasUpvoted(true);
    try {
      await upvoteReport(item.id);
    } catch {
      // Rollback on error
      setUpvotes((n) => n - 1);
      setHasUpvoted(false);
    }
  }

  return (
    <View style={[styles.reportRow, { borderLeftColor: color }]}>
      <Text style={styles.reportIcon}>{getReportIcon(item)}</Text>
      <View style={styles.reportBody}>
        <View style={styles.reportTopRow}>
          <View style={styles.reportLabelGroup}>
            {badge !== '' && (
              <Text style={[styles.reportBadge, { color }]}>{badge}</Text>
            )}
            <Text style={[styles.reportLabel, { color }]}>{getReportLabel(item)}</Text>
          </View>
          {item.distance_m !== undefined && (
            <Text style={styles.reportDist}>{formatDistance(item.distance_m)}</Text>
          )}
        </View>
        {item.notes !== null && <Text style={styles.reportNotes}>{item.notes}</Text>}
        <View style={styles.reportFooter}>
          <Text style={styles.reportAge}>
            {item.reported_by ? `${item.reported_by} · ` : ''}{formatRelativeTime(item.reported_at)}
          </Text>
          {/* Upvote / Verify button */}
          <TouchableOpacity
            style={[styles.upvoteBtn, hasUpvoted && styles.upvoteBtnActive]}
            onPress={handleUpvote}
            disabled={hasUpvoted}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Text style={[styles.upvoteIcon, hasUpvoted && styles.upvoteIconActive]}>
              {hasUpvoted ? '✅' : '👍'}
            </Text>
            <Text style={[styles.upvoteCount, hasUpvoted && styles.upvoteCountActive]}>
              {upvotes}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export function RecentConditionsPanel({ visible, reports, onClose, onReportCondition, onUpvote }: Props) {
  if (!visible) return null;

  return (
    <View style={styles.panel}>
      <View style={styles.header}>
        <Text style={styles.title}>Trail Conditions</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.close}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Summary strip */}
      {reports.length > 0 && (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>
            {reports.filter((r) => r.reportType === 'condition').length} conditions ·{' '}
            {reports.filter((r) => r.reportType === 'hazard').length} hazards ·{' '}
            {reports.filter((r) => r.reportType === 'snow_depth').length} snow reports
          </Text>
          <Text style={styles.allRidersTag}>🌍 All riders</Text>
        </View>
      )}

      <TouchableOpacity style={styles.reportBtn} onPress={onReportCondition}>
        <Text style={styles.reportBtnText}>+ Report Trail Condition</Text>
      </TouchableOpacity>

      {reports.length === 0 ? (
        <Text style={styles.empty}>No reports in this area yet. Be the first!</Text>
      ) : (
        <FlatList
          data={reports}
          keyExtractor={(r) => r.id}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <ReportRow
              item={item}
              onUpvote={onUpvote ?? (() => {})}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: '60%',
    backgroundColor: 'rgba(13,21,32,0.97)',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  close: { color: colors.textDim, fontSize: 18, padding: 4 },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryText: { color: colors.textDim, fontSize: 12 },
  allRidersTag: { color: '#00cc66', fontSize: 11, fontWeight: '700' },
  reportBtn: {
    backgroundColor: colors.accent + '22',
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    marginBottom: 12,
  },
  reportBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
  empty: { color: colors.textDim, textAlign: 'center', marginTop: 20, fontSize: 14 },
  list: { flex: 1 },
  reportRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 10,
    borderLeftWidth: 3,
    padding: 12,
    marginBottom: 8,
    gap: 10,
  },
  reportIcon: { fontSize: 20, marginTop: 1 },
  reportBody: { flex: 1 },
  reportTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 2,
  },
  reportLabelGroup: { flex: 1, gap: 1 },
  reportBadge: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  reportLabel: { fontSize: 14, fontWeight: '700' },
  reportDist: { color: colors.textDim, fontSize: 11, marginLeft: 8, flexShrink: 0 },
  reportNotes: { color: colors.textDim, fontSize: 13, marginTop: 3 },
  reportFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  reportAge: { color: colors.textDim, fontSize: 11 },
  // Upvote
  upvoteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  upvoteBtnActive: {
    backgroundColor: 'rgba(0,255,136,0.1)',
    borderColor: 'rgba(0,255,136,0.3)',
  },
  upvoteIcon: { fontSize: 12 },
  upvoteIconActive: {},
  upvoteCount: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  upvoteCountActive: { color: '#00ff88' },
});
