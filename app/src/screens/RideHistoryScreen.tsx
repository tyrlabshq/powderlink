import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  RefreshControl,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { EmptyState } from '../components/EmptyState';
import { RideHistorySkeleton } from '../components/SkeletonLoader';
import { getRideHistory, formatDuration } from '../api/rides';
import type { Ride } from '../api/rides';
import type { ProfileStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<ProfileStackParamList, 'RideHistory'>;

function RideRow({ ride, onPress }: { ride: Ride; onPress: () => void }) {
  const stats = ride.stats;
  const date = new Date(ride.startedAt).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
  const time = new Date(ride.startedAt).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true,
  });

  return (
    <TouchableOpacity style={styles.rideRow} onPress={onPress} activeOpacity={0.75}>
      <View style={styles.rideLeft}>
        <Text style={styles.rideDate}>{date}</Text>
        <Text style={styles.rideTime}>{time} — {ride.groupName}</Text>
        {stats && (
          <View style={styles.statsRow}>
            <Text style={styles.statChip}>📏 {stats.distanceMiles} mi</Text>
            <Text style={styles.statChip}>⏱ {formatDuration(stats.durationSeconds)}</Text>
            <Text style={styles.statChip}>⚡ {stats.topSpeedMph} mph</Text>
          </View>
        )}
      </View>
      <Text style={styles.arrow}>›</Text>
    </TouchableOpacity>
  );
}

// Placeholder rider ID — in a real app this comes from auth context
const PLACEHOLDER_RIDER_ID = 'me';

export default function RideHistoryScreen() {
  const navigation = useNavigation<Nav>();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    setError(null);
    try {
      const history = await getRideHistory(PLACEHOLDER_RIDER_ID);
      setRides(history);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load rides');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  function openRide(ride: Ride) {
    navigation.navigate('RideSummaryFromHistory', { ride });
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <RideHistorySkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={rides}
        keyExtractor={r => r.rideId}
        renderItem={({ item }) => <RideRow ride={item} onPress={() => openRide(item)} />}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={colors.accent} />
        }
        ListEmptyComponent={
          <EmptyState
            icon="🏔️"
            title="No rides yet"
            subtitle={"Your last 30 rides will appear here.\nHead out and start your first trail ride!"}
            ctaLabel="Start a Ride"
            onCta={() => navigation.getParent()?.navigate('Map')}
          />
        }
        ListHeaderComponent={
          error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  list: { padding: 16, paddingTop: 12 },

  rideRow: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  rideLeft: { flex: 1 },
  rideDate: { color: colors.text, fontSize: typography.md, fontWeight: '600' },
  rideTime: { color: colors.textDim, fontSize: typography.sm, marginTop: 2 },
  statsRow: { flexDirection: 'row', marginTop: 8, gap: 8, flexWrap: 'wrap' },
  statChip: {
    color: colors.accent,
    fontSize: typography.xs,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  arrow: { color: colors.textDim, fontSize: typography.xl, fontWeight: '300', marginLeft: 8 },

  errorBanner: {
    backgroundColor: colors.danger + '22',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.danger,
  },
  errorText: { color: colors.danger, fontSize: typography.sm },
});
