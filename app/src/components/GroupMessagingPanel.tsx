import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  FlatList,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { colors } from '../theme/colors';
import type { GroupMessage } from '../hooks/useGroupWebSocket';

// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

interface PresetMessage {
  label: string;
  emoji: string;
  text: string;
}

const PRESET_MESSAGES: PresetMessage[] = [
  { label: 'Stopping', emoji: '🛑', text: 'Stopping' },
  { label: 'Need Help', emoji: '🆘', text: 'Need Help' },
  { label: 'Go Ahead', emoji: '👍', text: 'Go Ahead' },
  { label: 'Slow Down', emoji: '⚠️', text: 'Slow Down' },
];

/** Show the latest N messages in the feed. */
const DISPLAY_LIMIT = 10;

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface GroupMessagingPanelProps {
  /** All received group messages (maintained by useGroupWebSocket). */
  messages: GroupMessage[];
  /** Send a message — handles offline queuing internally in the hook. */
  onSend: (text: string, preset?: string | null) => void;
  /** Whether the WebSocket or mesh is currently connected. */
  connected: boolean;
  /** Current rider's ID — used to style own messages differently. */
  currentRiderId?: string;
  /** True when running on mesh only (no internet). Shows mesh indicator. */
  offlineMode?: boolean;
  /** Number of directly connected mesh peers. */
  meshPeerCount?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GroupMessagingPanel({
  messages,
  onSend,
  connected,
  currentRiderId,
  offlineMode = false,
  meshPeerCount = 0,
}: GroupMessagingPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [inputText, setInputText] = useState('');
  const flatListRef = useRef<FlatList<GroupMessage>>(null);

  // Auto-scroll to newest message when feed is open or new messages arrive
  useEffect(() => {
    if (expanded && messages.length > 0) {
      flatListRef.current?.scrollToEnd({ animated: true });
    }
  }, [messages.length, expanded]);

  function handleSendPreset(preset: PresetMessage) {
    onSend(preset.text, preset.label);
  }

  function handleSendCustom() {
    const text = inputText.trim();
    if (!text) return;
    onSend(text, null);
    setInputText('');
  }

  // Show most recent DISPLAY_LIMIT messages
  const displayMessages = messages.slice(-DISPLAY_LIMIT);
  // Unread count when collapsed
  const unreadCount = messages.length;

  return (
    <View style={styles.container}>
      {/* ---- Collapsible header ---- */}
      <TouchableOpacity
        style={styles.header}
        onPress={() => setExpanded((prev) => !prev)}
        activeOpacity={0.75}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.statusDot, { backgroundColor: connected ? colors.success : colors.textDim }]} />
          <Text style={styles.headerTitle}>💬 Group Chat</Text>
          {!expanded && unreadCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unreadCount > 9 ? '9+' : unreadCount}</Text>
            </View>
          )}
        </View>
        <Text style={styles.chevron}>{expanded ? '▾' : '▸'}</Text>
      </TouchableOpacity>

      {/* ---- Expanded content ---- */}
      {expanded && (
        <View style={styles.content}>
          {/* Message feed */}
          <FlatList
            ref={flatListRef}
            data={displayMessages}
            keyExtractor={(m) => m.messageId}
            style={styles.feed}
            contentContainerStyle={styles.feedContent}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: false })}
            ListEmptyComponent={
              <Text style={styles.emptyText}>No messages yet. Tap a preset or type something.</Text>
            }
            renderItem={({ item }) => {
              const isMe = item.riderId === currentRiderId;
              return (
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                  {!isMe && <Text style={styles.bubbleName}>{item.riderName}</Text>}
                  <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.text}</Text>
                  <Text style={[styles.bubbleTime, isMe && styles.bubbleTimeMe]}>
                    {new Date(item.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              );
            }}
          />

          {/* Preset message buttons */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.presets}
            contentContainerStyle={styles.presetsContent}
          >
            {PRESET_MESSAGES.map((p) => (
              <TouchableOpacity
                key={p.label}
                style={[styles.presetBtn, !connected && styles.presetBtnDisabled]}
                onPress={() => handleSendPreset(p)}
                disabled={!connected}
                activeOpacity={0.7}
              >
                <Text style={styles.presetBtnText}>
                  {p.emoji} {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Custom text input */}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={inputText}
              onChangeText={setInputText}
              placeholder="Type a message…"
              placeholderTextColor={colors.textDim}
              maxLength={200}
              returnKeyType="send"
              onSubmitEditing={handleSendCustom}
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!inputText.trim() || !connected) && styles.sendBtnDisabled,
              ]}
              onPress={handleSendCustom}
              disabled={!inputText.trim() || !connected}
              activeOpacity={0.8}
            >
              <Text style={styles.sendBtnText}>Send</Text>
            </TouchableOpacity>
          </View>

          {/* Connectivity indicator */}
          {!connected && !offlineMode && (
            <Text style={styles.offlineNote}>
              ⚡ Offline — messages will send when reconnected
            </Text>
          )}
          {offlineMode && (
            <Text style={[styles.offlineNote, styles.meshNote]}>
              📡 Mesh mode — {meshPeerCount} peer{meshPeerCount !== 1 ? 's' : ''} nearby · no internet needed
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.textDim + '33',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  badge: {
    backgroundColor: colors.accent,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '700',
  },
  chevron: {
    color: colors.textDim,
    fontSize: 16,
  },

  // Expanded content
  content: {
    borderTopWidth: 1,
    borderTopColor: colors.textDim + '22',
  },

  // Feed
  feed: {
    maxHeight: 200,
  },
  feedContent: {
    padding: 12,
    gap: 8,
  },
  emptyText: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: 16,
  },

  // Message bubbles
  bubble: {
    maxWidth: '80%',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  bubbleMe: {
    alignSelf: 'flex-end',
    backgroundColor: colors.accent + '28',
  },
  bubbleThem: {
    alignSelf: 'flex-start',
  },
  bubbleName: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 2,
  },
  bubbleText: {
    color: colors.text,
    fontSize: 14,
  },
  bubbleTextMe: {
    color: colors.text,
  },
  bubbleTime: {
    color: colors.textDim,
    fontSize: 10,
    marginTop: 3,
    alignSelf: 'flex-start',
  },
  bubbleTimeMe: {
    alignSelf: 'flex-end',
  },

  // Presets
  presets: {
    borderTopWidth: 1,
    borderTopColor: colors.textDim + '22',
  },
  presetsContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  presetBtn: {
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginRight: 8,
  },
  presetBtnDisabled: {
    borderColor: colors.textDim,
    opacity: 0.5,
  },
  presetBtnText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },

  // Input row
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: colors.textDim + '22',
  },
  input: {
    flex: 1,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.textDim + '66',
    borderRadius: 20,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  sendBtnDisabled: {
    opacity: 0.4,
  },
  sendBtnText: {
    color: '#000',
    fontSize: 14,
    fontWeight: '700',
  },

  // Offline note
  offlineNote: {
    color: '#ffaa00',
    fontSize: 11,
    textAlign: 'center',
    paddingBottom: 10,
    paddingHorizontal: 12,
  },
  meshNote: {
    color: '#00aaff',
  },
});
