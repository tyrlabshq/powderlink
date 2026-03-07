import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { colors } from '../theme/colors';
import { typography } from '../theme/typography';

interface Props {
  onAuthenticated: () => void;
}

export default function OnboardingScreen({ onAuthenticated }: Props) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStart = async () => {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      Alert.alert('Too short', 'Enter at least 2 characters for your display name.');
      return;
    }

    setLoading(true);
    try {
      // Sign in anonymously — Supabase creates a real auth session with no credentials required
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      if (!data.user) throw new Error('No user returned from auth');

      // Persist the rider's display name in the riders table
      const { error: upsertError } = await supabase
        .from('riders')
        .upsert({ id: data.user.id, display_name: trimmed });
      if (upsertError) throw upsertError;

      onAuthenticated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Could not sign in. Check your connection.';
      Alert.alert('Error', message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>🏔️</Text>
        <Text style={styles.title}>TrailGuard</Text>
        <Text style={styles.subtitle}>Ride together. Stay safe.</Text>

        <View style={styles.card}>
          <Text style={styles.label}>What should we call you?</Text>
          <TextInput
            style={styles.input}
            placeholder="Display name"
            placeholderTextColor={colors.textDim}
            value={name}
            onChangeText={setName}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={handleStart}
            maxLength={40}
          />

          <TouchableOpacity
            style={[styles.button, loading && styles.buttonDisabled]}
            onPress={handleStart}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#000" />
            ) : (
              <Text style={styles.buttonText}>Start Riding →</Text>
            )}
          </TouchableOpacity>
        </View>

        <Text style={styles.hint}>No account needed. Just pick a name.</Text>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  logo: {
    fontSize: 72,
    marginBottom: 16,
  },
  title: {
    fontSize: typography.hero,
    fontWeight: typography.heavy,
    color: colors.text,
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: typography.md,
    fontWeight: typography.regular,
    color: colors.textDim,
    marginBottom: 48,
    marginTop: 6,
    letterSpacing: 0.5,
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 24,
    gap: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  label: {
    fontSize: typography.md,
    fontWeight: typography.semibold,
    color: colors.text,
  },
  input: {
    backgroundColor: colors.background,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: typography.md,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    fontSize: typography.md,
    fontWeight: typography.bold,
    color: colors.text,
    letterSpacing: 0.3,
  },
  hint: {
    marginTop: 24,
    fontSize: typography.xs,
    color: colors.textMuted,
    letterSpacing: 0.3,
  },
});
