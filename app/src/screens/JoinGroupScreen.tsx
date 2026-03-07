import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { joinGroup } from '../api/groups';
import { useGroup } from '../context/GroupContext';
import { colors } from '../theme/colors';
import type { GroupStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<GroupStackParamList, 'JoinGroup'>;

export default function JoinGroupScreen() {
  const navigation = useNavigation<Nav>();
  const { setGroup } = useGroup();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin() {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 6) { Alert.alert('Enter a 6-character group code'); return; }
    setLoading(true);
    try {
      const res = await joinGroup(trimmed);
      setGroup({ groupId: res.groupId, code: trimmed, name: res.name, role: 'member' });
      navigation.replace('GroupDashboard');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to join group');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()}>
        <Text style={styles.backText}>← Back</Text>
      </TouchableOpacity>

      <Text style={styles.title}>Join Group</Text>
      <Text style={styles.hint}>Ask your group leader for the 6-character code.</Text>

      <TextInput
        style={styles.input}
        placeholder="WOLF42"
        placeholderTextColor={colors.textDim}
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        maxLength={6}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
      />

      <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleJoin} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Join Group</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, padding: 24, justifyContent: 'center' },
  back: { position: 'absolute', top: 56, left: 24 },
  backText: { color: colors.accent, fontSize: 16 },
  title: { color: colors.text, fontSize: 28, fontWeight: '700', marginBottom: 8 },
  hint: { color: colors.textDim, fontSize: 14, marginBottom: 32 },
  input: {
    backgroundColor: colors.surface,
    color: colors.text,
    borderRadius: 10,
    padding: 16,
    fontSize: 24,
    letterSpacing: 6,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
    textAlign: 'center',
  },
  btn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: '#000', fontSize: 17, fontWeight: '700' },
});
