import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors } from '../theme/colors';

export default function ProfileScreen() {
  const navigation = useNavigation<any>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Profile</Text>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => navigation.navigate('RideHistory')}
      >
        <Text style={styles.menuIcon}>🛷</Text>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Ride History</Text>
          <Text style={styles.menuSubtitle}>Your last 30 rides — stats, routes, and summaries</Text>
        </View>
        <Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.menuItem}
        onPress={() => navigation.navigate('EmergencyInfo')}
      >
        <Text style={styles.menuIcon}>🆘</Text>
        <View style={styles.menuText}>
          <Text style={styles.menuTitle}>Emergency Info</Text>
          <Text style={styles.menuSubtitle}>Medical info, contacts & QR code for first responders</Text>
        </View>
        <Text style={styles.menuArrow}>›</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingTop: 60 },
  header: { color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 24 },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.textDim,
  },
  menuIcon: { fontSize: 28, marginRight: 14 },
  menuText: { flex: 1 },
  menuTitle: { color: colors.text, fontSize: 16, fontWeight: '600' },
  menuSubtitle: { color: colors.textDim, fontSize: 13, marginTop: 2 },
  menuArrow: { color: colors.textDim, fontSize: 24, fontWeight: '300' },
});
