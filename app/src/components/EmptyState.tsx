import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface EmptyStateProps {
  icon?: string;
  title: string;
  subtitle?: string;
  ctaLabel?: string;
  onCta?: () => void;
}

export function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: EmptyStateProps) {
  return (
    <View style={styles.container}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {ctaLabel && onCta ? (
        <TouchableOpacity style={styles.cta} onPress={onCta} activeOpacity={0.8}>
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    paddingTop: 80,
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 52,
    marginBottom: 16,
  },
  title: {
    color: colors.text,
    fontSize: typography.lg,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: colors.textDim,
    fontSize: typography.sm,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 24,
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  ctaText: {
    color: '#fff',
    fontSize: typography.md,
    fontWeight: '700',
  },
});
