import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { useGroup } from '../context/GroupContext';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { GroupDashboardSkeleton } from '../components/SkeletonLoader';
import type { GroupStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<GroupStackParamList, 'GroupHome'>;

export default function GroupHomeScreen() {
  const navigation = useNavigation<Nav>();
  const { group, isLoading } = useGroup();

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <GroupDashboardSkeleton />
      </View>
    );
  }

  if (group) {
    // Already in a group — redirect to dashboard
    navigation.replace('GroupDashboard');
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>TrailGuard</Text>
      <Text style={styles.subtitle}>Ride together. Stay connected.</Text>

      <TouchableOpacity style={styles.btnPrimary} onPress={() => navigation.navigate('CreateGroup')}>
        <Text style={styles.btnPrimaryText}>Create Group</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.btnSecondary} onPress={() => navigation.navigate('JoinGroup')}>
        <Text style={styles.btnSecondaryText}>Join Group</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: { color: colors.accent, fontSize: typography.xxl, fontWeight: '700', marginBottom: 8 },
  subtitle: { color: colors.textDim, fontSize: typography.md, marginBottom: 56, textAlign: 'center' },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    marginBottom: 16,
    width: '100%',
    alignItems: 'center',
  },
  btnPrimaryText: { color: '#fff', fontSize: typography.lg, fontWeight: '700' },
  btnSecondary: {
    borderColor: colors.accent,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 48,
    width: '100%',
    alignItems: 'center',
  },
  btnSecondaryText: { color: colors.accent, fontSize: typography.lg, fontWeight: '600' },
});
