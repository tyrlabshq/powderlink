import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import { createGroup } from '../api/groups';
import { useGroup } from '../context/GroupContext';
import { colors } from '../theme/colors';
import type { GroupStackParamList } from '../navigation/AppNavigator';

type Nav = StackNavigationProp<GroupStackParamList, 'CreateGroup'>;

export default function CreateGroupScreen() {
  const navigation = useNavigation<Nav>();
  const { setGroup } = useGroup();
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) { Alert.alert('Enter a group name'); return; }
    setLoading(true);
    try {
      const res = await createGroup(trimmed);
      setGroup({ groupId: res.groupId, code: res.code, name: trimmed, role: 'leader' });
      navigation.replace('GroupDashboard');
    } catch (e: unknown) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to create group');
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

      <Text style={styles.title}>Create Group</Text>
      <Text style={styles.hint}>A 6-character code will be generated for others to join.</Text>

      <TextInput
        style={styles.input}
        placeholder="Group name (e.g. Wolf Pack)"
        placeholderTextColor={colors.textDim}
        value={name}
        onChangeText={setName}
        maxLength={32}
        autoFocus
      />

      <TouchableOpacity style={[styles.btn, loading && styles.btnDisabled]} onPress={handleCreate} disabled={loading}>
        {loading ? <ActivityIndicator color="#000" /> : <Text style={styles.btnText}>Create Group</Text>}
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
    fontSize: 17,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.border,
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
