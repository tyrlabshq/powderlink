import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface MenuItem {
  icon: string;
  title: string;
  subtitle: string;
  screen: string;
  params?: Record<string, unknown>;
  danger?: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    icon: '🛷',
    title: 'Ride History',
    subtitle: 'Your last 30 rides — stats, routes, and summaries',
    screen: 'RideHistory',
  },
  {
    icon: '🗺️',
    title: 'Offline Maps',
    subtitle: 'Download trail maps for zero-signal riding',
    screen: 'OfflineMaps',
  },
  {
    icon: '▶️',
    title: 'Ride Replay',
    subtitle: '3D flyover of your recorded GPS tracks',
    screen: 'RideReplay',
    params: { rideId: '__latest__' },
  },
  {
    icon: '🧭',
    title: 'Compass Navigation',
    subtitle: 'GPS + compass offline mode — no signal needed',
    screen: 'CompassNav',
  },
  {
    icon: '🆘',
    title: 'Emergency Info',
    subtitle: 'Medical info, contacts & QR code for first responders',
    screen: 'EmergencyInfo',
    danger: true,
  },
];

function MenuRow({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  return (
    <TouchableOpacity
      style={[styles.menuItem, item.danger && styles.menuItemDanger]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={[styles.menuIconContainer, item.danger && styles.menuIconDanger]}>
        <Text style={styles.menuIcon}>{item.icon}</Text>
      </View>
      <View style={styles.menuText}>
        <Text style={[styles.menuTitle, item.danger && styles.menuTitleDanger]}>{item.title}</Text>
        <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
      </View>
      <Text style={styles.menuArrow}>›</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const navigation = useNavigation<any>();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.header}>Profile</Text>
            <Text style={styles.headerSub}>Settings & Tools</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>🏔</Text>
          </View>
        </View>

        {/* Section label */}
        <Text style={styles.sectionLabel}>TOOLS</Text>

        {MENU_ITEMS.map((item) => (
          <MenuRow
            key={item.screen}
            item={item}
            onPress={() => navigation.navigate(item.screen, item.params)}
          />
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingTop: 20, paddingBottom: 32 },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 28,
  },
  header: {
    color: colors.text,
    fontSize: typography.xxl,
    fontWeight: typography.bold,
    letterSpacing: 0.3,
  },
  headerSub: {
    color: colors.textDim,
    fontSize: typography.sm,
    fontWeight: typography.regular,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarText: { fontSize: 22 },

  sectionLabel: {
    color: colors.textDim,
    fontSize: typography.xs,
    fontWeight: typography.semibold,
    letterSpacing: 1.5,
    marginBottom: 10,
    marginLeft: 4,
  },

  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  menuItemDanger: {
    borderColor: colors.danger + '40',
  },
  menuIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary + '44',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  menuIconDanger: {
    backgroundColor: colors.danger + '22',
  },
  menuIcon: { fontSize: 22 },
  menuText: { flex: 1 },
  menuTitle: {
    color: colors.text,
    fontSize: typography.md,
    fontWeight: typography.semibold,
  },
  menuTitleDanger: { color: colors.danger },
  menuSubtitle: {
    color: colors.textDim,
    fontSize: typography.xs,
    fontWeight: typography.regular,
    marginTop: 3,
    lineHeight: 16,
  },
  menuArrow: {
    color: colors.textDim,
    fontSize: typography.xl,
    fontWeight: typography.regular,
  },
});
