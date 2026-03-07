import React, { useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet,
  Share, Alert, ActivityIndicator,
} from 'react-native';
import { useRoute, useNavigation, RouteProp } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../theme/colors';
import { formatDuration } from '../api/rides';
import type { RideStats, Ride } from '../api/rides';
import type { GroupStackParamList } from '../navigation/AppNavigator';

type RideSummaryRoute = RouteProp<GroupStackParamList, 'RideSummary'>;
type Nav = StackNavigationProp<GroupStackParamList, 'RideSummary'>;

function StatCard({ icon, label, value, sub }: {
  icon: string; label: string; value: string; sub?: string;
}) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statIcon}>{icon}</Text>
      <Text style={styles.statValue}>{value}</Text>
      {sub && <Text style={styles.statSub}>{sub}</Text>}
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function RideSummaryScreen() {
  const route = useRoute<RideSummaryRoute>();
  const navigation = useNavigation<Nav>();
  const { ride } = route.params;
  const stats: RideStats | null = ride.stats;

  const duration = stats ? formatDuration(stats.durationSeconds) : '--';
  const groupName = ride.groupName || 'Group Ride';
  const rideDate = ride.startedAt
    ? new Date(ride.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

  async function handleShare() {
    if (!stats) return;
    const text =
      `🛷 PowderLink Ride Summary\n` +
      `📅 ${rideDate} — ${groupName}\n\n` +
      `📏 Distance: ${stats.distanceMiles} mi\n` +
      `⏱ Duration: ${formatDuration(stats.durationSeconds)}\n` +
      `⚡ Top Speed: ${stats.topSpeedMph} mph\n` +
      `📊 Avg Speed: ${stats.avgSpeedMph} mph\n` +
      `🏔 Max Altitude: ${stats.maxAltitudeFt.toLocaleString()} ft\n` +
      `↑ Elevation Gain: ${stats.elevationGainFt} ft\n` +
      `↓ Elevation Loss: ${stats.elevationLossFt} ft\n\n` +
      `Tracked with PowderLink 🔵`;

    try {
      await Share.share({ message: text, title: 'PowderLink Ride' });
    } catch (e) {
      Alert.alert('Share failed', 'Could not share ride stats.');
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Ride Complete</Text>
        <Text style={styles.subtitle}>{groupName}</Text>
        <Text style={styles.date}>{rideDate}</Text>
      </View>

      {/* Route Map Placeholder */}
      <View style={styles.mapContainer}>
        <Text style={styles.mapPlaceholder}>🗺</Text>
        <Text style={styles.mapText}>
          {stats ? `Route: ${stats.pointCount} points tracked` : 'No route data'}
        </Text>
      </View>

      {/* Stats Grid */}
      {stats ? (
        <View style={styles.statsGrid}>
          <StatCard icon="📏" label="Distance" value={`${stats.distanceMiles} mi`} />
          <StatCard icon="⏱" label="Duration" value={duration} />
          <StatCard icon="⚡" label="Top Speed" value={`${stats.topSpeedMph}`} sub="mph" />
          <StatCard icon="📊" label="Avg Speed" value={`${stats.avgSpeedMph}`} sub="mph" />
          <StatCard icon="🏔" label="Max Altitude" value={stats.maxAltitudeFt.toLocaleString()} sub="ft" />
          <StatCard icon="↑" label="Elev. Gain" value={`+${stats.elevationGainFt}`} sub="ft" />
          <StatCard icon="↓" label="Elev. Loss" value={`-${stats.elevationLossFt}`} sub="ft" />
          <StatCard icon="📍" label="GPS Points" value={`${stats.pointCount}`} />
        </View>
      ) : (
        <View style={styles.noStats}>
          <Text style={styles.noStatsText}>No stats available for this ride.</Text>
        </View>
      )}

      {/* Actions */}
      <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
        <Text style={styles.shareBtnText}>⬆ Share Ride</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.doneBtn}
        onPress={() => navigation.navigate('GroupDashboard')}
      >
        <Text style={styles.doneBtnText}>Back to Group</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },

  header: { alignItems: 'center', marginBottom: 24 },
  title: { color: colors.success, fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { color: colors.text, fontSize: 18, fontWeight: '600' },
  date: { color: colors.textDim, fontSize: 14, marginTop: 4 },

  mapContainer: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapPlaceholder: { fontSize: 48 },
  mapText: { color: colors.textDim, fontSize: 13, marginTop: 8 },

  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 28,
    justifyContent: 'space-between',
  },
  statCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    width: '47%',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  statIcon: { fontSize: 24, marginBottom: 6 },
  statValue: { color: colors.accent, fontSize: 22, fontWeight: '700' },
  statSub: { color: colors.textDim, fontSize: 12 },
  statLabel: { color: colors.textDim, fontSize: 12, marginTop: 4 },

  noStats: { padding: 24, alignItems: 'center' },
  noStatsText: { color: colors.textDim, fontSize: 14 },

  shareBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginBottom: 12,
  },
  shareBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  doneBtn: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  doneBtnText: { color: colors.text, fontSize: 16, fontWeight: '600' },
});
