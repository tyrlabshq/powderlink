import { useState, useEffect, useRef, useCallback } from 'react';

export interface MemberLocation {
  userId: string;
  lat: number;
  lng: number;
  speed: number;     // mph
  battery: number;   // percent 0–100
  timestamp: string; // ISO string
}

/** Count-me-out timer state for a specific rider (received via WS broadcast). */
export interface CMOState {
  riderId: string;
  etaAt: string;          // ISO
  durationMinutes: number;
  note: string | null;
}

/** Sweep gap data — only relevant if current user is the sweep or leader. */
export interface SweepGap {
  lastRiderId: string;
  distanceMiles: number;
  alert: boolean;
}

/** A group chat message received over WebSocket. */
export interface GroupMessage {
  messageId: string;
  riderId: string;
  riderName: string;
  text: string;
  preset: string | null;
  timestamp: number;
}

/** Options for auto-joining a group session and enabling messaging. */
export interface UseGroupWebSocketOptions {
  groupId?: string;
  riderId?: string;
  riderName?: string;
}

/** Queued outbound message (sent when connectivity restores). */
interface PendingMessage {
  type: 'group_message';
  text: string;
  preset: string | null;
  riderName: string;
}

const BASE_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const MAX_MESSAGES = 50; // keep last 50 in memory, display last 10

const WS_URL =
  (process.env as Record<string, string | undefined>).EXPO_PUBLIC_WS_URL ??
  'ws://localhost:3001';

interface UseGroupWebSocketResult {
  members: Map<string, MemberLocation>;
  connected: boolean;
  /** Map of riderId -> active CMO state for riders in the group. */
  cmoStates: Map<string, CMOState>;
  /** Current sweep gap — populated if the current user is sweep or leader. */
  sweepGap: SweepGap | null;
  /** True if rider received a count-me-out 2-minute warning. */
  cmoWarning: boolean;
  /** Dismiss the CMO warning after the rider has seen it. */
  dismissCmoWarning: () => void;
  /** Leader alert: sweep has fallen >2mi behind. */
  sweepLeaderAlert: string | null;
  dismissSweepLeaderAlert: () => void;
  /** Group chat messages received during this session. */
  messages: GroupMessage[];
  /** Send a group message. Queued offline if not currently connected. */
  sendGroupMessage: (text: string, preset?: string | null) => void;
}

export function useGroupWebSocket(options?: UseGroupWebSocketOptions): UseGroupWebSocketResult {
  const [members, setMembers] = useState<Map<string, MemberLocation>>(new Map());
  const [connected, setConnected] = useState(false);
  const [cmoStates, setCmoStates] = useState<Map<string, CMOState>>(new Map());
  const [sweepGap, setSweepGap] = useState<SweepGap | null>(null);
  const [cmoWarning, setCmoWarning] = useState(false);
  const [sweepLeaderAlert, setSweepLeaderAlert] = useState<string | null>(null);
  const [messages, setMessages] = useState<GroupMessage[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectDelay = useRef(BASE_RECONNECT_MS);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmounted = useRef(false);
  // Offline message queue — flushed on reconnect
  const pendingQueue = useRef<PendingMessage[]>([]);
  // Keep latest options in a ref so callbacks always see fresh values without re-subscribing
  const optionsRef = useRef<UseGroupWebSocketOptions | undefined>(options);
  useEffect(() => { optionsRef.current = options; }, [options]);

  const dismissCmoWarning = useCallback(() => setCmoWarning(false), []);
  const dismissSweepLeaderAlert = useCallback(() => setSweepLeaderAlert(null), []);

  const sendGroupMessage = useCallback((text: string, preset: string | null = null) => {
    const opts = optionsRef.current;
    const payload: PendingMessage = {
      type: 'group_message',
      text: text.trim().slice(0, 200),
      preset,
      riderName: opts?.riderName ?? 'Rider',
    };
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    } else {
      // Queue for when connectivity restores
      pendingQueue.current.push(payload);
    }
  }, []);

  const connect = useCallback(() => {
    if (unmounted.current) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (unmounted.current) {
          ws.close();
          return;
        }
        setConnected(true);
        reconnectDelay.current = BASE_RECONNECT_MS;

        // Auto-join group session if options were provided
        const opts = optionsRef.current;
        if (opts?.groupId && opts?.riderId) {
          ws.send(JSON.stringify({
            type: 'join_group',
            groupId: opts.groupId,
            riderId: opts.riderId,
          }));
        }

        // Flush any messages queued while offline
        if (pendingQueue.current.length > 0) {
          const queue = pendingQueue.current.splice(0);
          for (const pending of queue) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify(pending));
            }
          }
        }
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ws.onmessage = (event: any) => {
        try {
          const msg = JSON.parse(event.data) as Record<string, any>;

          switch (msg.type) {
            case 'location_update': {
              const loc: MemberLocation = {
                userId: msg.riderId ?? msg.userId,
                lat: msg.location?.lat ?? msg.lat,
                lng: msg.location?.lng ?? msg.lng,
                speed: msg.speedMph ?? msg.speed ?? 0,
                battery: msg.battery ?? 100,
                timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString(),
              };
              setMembers((prev) => {
                const next = new Map(prev);
                next.set(loc.userId, loc);
                return next;
              });
              break;
            }

            case 'count_me_out_started': {
              const state: CMOState = {
                riderId: msg.riderId,
                etaAt: msg.etaAt,
                durationMinutes: msg.durationMinutes,
                note: msg.note ?? null,
              };
              setCmoStates((prev) => {
                const next = new Map(prev);
                next.set(msg.riderId, state);
                return next;
              });
              break;
            }

            case 'count_me_out_cancelled': {
              setCmoStates((prev) => {
                const next = new Map(prev);
                next.delete(msg.riderId);
                return next;
              });
              break;
            }

            case 'count_me_out_warning': {
              // Personal warning — the current rider is the one counting out
              setCmoWarning(true);
              break;
            }

            case 'sweep_gap_update': {
              setSweepGap({
                lastRiderId: msg.lastRiderId,
                distanceMiles: msg.distanceMiles,
                alert: msg.alert,
              });
              break;
            }

            case 'sweep_gap_leader_alert': {
              setSweepLeaderAlert(msg.message ?? `Sweep is ${msg.distanceMiles?.toFixed(1)}mi behind`);
              break;
            }

            case 'group_message': {
              const gm: GroupMessage = {
                messageId: msg.messageId ?? `${Date.now()}-${Math.random()}`,
                riderId: msg.riderId ?? '',
                riderName: msg.riderName ?? 'Rider',
                text: msg.text ?? '',
                preset: msg.preset ?? null,
                timestamp: typeof msg.timestamp === 'number' ? msg.timestamp : Date.now(),
              };
              setMessages((prev) => {
                // Deduplicate by messageId
                if (prev.some((m) => m.messageId === gm.messageId)) return prev;
                const next = [...prev, gm];
                return next.length > MAX_MESSAGES ? next.slice(-MAX_MESSAGES) : next;
              });
              break;
            }

            case 'group_message_history': {
              if (!Array.isArray(msg.messages)) break;
              const history: GroupMessage[] = msg.messages.map((m: Record<string, unknown>) => ({
                messageId: (m.messageId as string) ?? `${Date.now()}-${Math.random()}`,
                riderId: (m.riderId as string) ?? '',
                riderName: (m.riderName as string) ?? 'Rider',
                text: (m.text as string) ?? '',
                preset: (m.preset as string | null) ?? null,
                timestamp: typeof m.timestamp === 'number' ? m.timestamp : Date.now(),
              }));
              setMessages(history.slice(-MAX_MESSAGES));
              break;
            }

            default:
              break;
          }
        } catch {
          // Ignore malformed messages
        }
      };

      ws.onclose = () => {
        if (unmounted.current) return;
        setConnected(false);
        scheduleReconnect();
      };

      ws.onerror = () => {
        // onclose fires after onerror
        ws.close();
      };
    } catch {
      setConnected(false);
      scheduleReconnect();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const scheduleReconnect = useCallback(() => {
    const delay = reconnectDelay.current;
    reconnectDelay.current = Math.min(delay * 2, MAX_RECONNECT_MS);
    reconnectTimer.current = setTimeout(connect, delay);
  }, [connect]);

  useEffect(() => {
    unmounted.current = false;
    connect();
    return () => {
      unmounted.current = true;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return {
    members,
    connected,
    cmoStates,
    sweepGap,
    cmoWarning,
    dismissCmoWarning,
    sweepLeaderAlert,
    dismissSweepLeaderAlert,
    messages,
    sendGroupMessage,
  };
}
