import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';
import { EmptyState } from '../components/EmptyState';

/**
 * GroupScreen — entry point for the Group tab.
 * Mirrors GroupHomeScreen but surfaced from the tab bar.
 */
export default function GroupScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <EmptyState
        icon="🏕️"
        title="No active group"
        subtitle={"Create a group or join one to ride\ntogether and share your location."}
        ctaLabel="Create or Join a Group"
        onCta={() => navigation.navigate('GroupHome')}
      />

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('GroupHome')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>+ Create Group</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.btnSecondary}
          onPress={() => navigation.navigate('GroupHome')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnSecondaryText}>Join with Code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  actions: {
    paddingHorizontal: 32,
    paddingBottom: 48,
    gap: 12,
  },
  btnPrimary: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnPrimaryText: {
    color: '#fff',
    fontSize: typography.md,
    fontWeight: '700',
  },
  btnSecondary: {
    backgroundColor: 'transparent',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: colors.primary,
  },
  btnSecondaryText: {
    color: colors.primaryLight,
    fontSize: typography.md,
    fontWeight: '600',
  },
});
