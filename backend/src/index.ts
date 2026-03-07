import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { WebSocketServer } from 'ws';
import WebSocket from 'ws';
import http from 'http';
import authRoutes from './routes/auth';
import groupRoutes from './routes/groups';
import locationRoutes from './routes/locations';
import alertRoutes from './routes/alerts';
import countMeOutRoutes from './routes/countMeOut';
import trailRoutes from './routes/trails';
import emergencyRoutes from './routes/emergency';
import rideRoutes from './routes/rides';
import garminRoutes from './routes/garmin';
import { addClient, removeClient, broadcastToGroup, WsClient } from './ws';
import { redis } from './redis';
import { checkDMS } from './services/dms';
import { checkCountMeOut } from './services/countMeOut';
import { pollDueGarminFeeds } from './services/garmin';

const app = express();
const PORT = parseInt(process.env.PORT || '8420', 10);

app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'powderlink-api' });
});

// Routes
app.use('/auth', authRoutes);
app.use('/groups', groupRoutes);
app.use('/locations', locationRoutes);
app.use('/alerts', alertRoutes);
app.use('/alerts/count-me-out', countMeOutRoutes);
app.use('/trails', trailRoutes);
app.use('/emergency', emergencyRoutes);
app.use('/rides', rideRoutes);
app.use('/garmin', garminRoutes);

// HTTP + WebSocket server
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const HEARTBEAT_INTERVAL = 30_000;

wss.on('connection', (ws) => {
  let client: WsClient | null = null;
  let alive = true;

  ws.on('pong', () => {
    alive = true;
  });

  ws.on('message', (data) => {
    let msg: any;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
      return;
    }

    if (msg.type === 'join_group') {
      if (!msg.groupId || !msg.riderId) {
        ws.send(JSON.stringify({ type: 'error', message: 'groupId and riderId required' }));
        return;
      }

      // Remove previous client if re-joining
      if (client) removeClient(client);

      client = { ws, riderId: msg.riderId, groupId: msg.groupId };
      addClient(client);

      ws.send(JSON.stringify({ type: 'joined', groupId: msg.groupId }));
      broadcastToGroup(msg.groupId, { type: 'rider_joined', riderId: msg.riderId }, msg.riderId);

      // Send recent message history to late joiners
      const historyKey = `group_messages:${msg.groupId}`;
      redis.lrange(historyKey, 0, 49)
        .then((items: string[]) => {
          if (items.length === 0) return;
          const messages = items
            .map((item: string) => { try { return JSON.parse(item); } catch { return null; } })
            .filter(Boolean)
            .reverse(); // LPUSH = newest first, send oldest first
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'group_message_history', messages }));
          }
        })
        .catch((err: Error) => console.error('Redis group_message_history error:', err));
    }

    if (msg.type === 'location_update' && client) {
      broadcastToGroup(client.groupId, {
        type: 'location_update',
        riderId: client.riderId,
        location: msg.location,
        heading: msg.heading,
        speedMph: msg.speedMph,
        source: msg.source,
        timestamp: Date.now(),
      }, client.riderId);
    }

    if (msg.type === 'group_message' && client) {
      const rawText = typeof msg.text === 'string' ? msg.text.trim().slice(0, 200) : '';
      if (!rawText) return;

      const messagePayload = {
        type: 'group_message',
        messageId: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        riderId: client.riderId,
        riderName: typeof msg.riderName === 'string' ? msg.riderName.trim().slice(0, 50) : 'Rider',
        text: rawText,
        preset: typeof msg.preset === 'string' ? msg.preset : null,
        timestamp: Date.now(),
      };

      // Broadcast to all group members including sender
      broadcastToGroup(client.groupId, messagePayload);

      // Store last 50 messages in Redis (fire-and-forget)
      const redisKey = `group_messages:${client.groupId}`;
      redis.pipeline()
        .lpush(redisKey, JSON.stringify(messagePayload))
        .ltrim(redisKey, 0, 49)
        .expire(redisKey, 86400) // 24h TTL
        .exec()
        .catch((err: Error) => console.error('Redis group_message store error:', err));
    }
  });

  ws.on('close', () => {
    if (client) {
      broadcastToGroup(client.groupId, { type: 'rider_left', riderId: client.riderId }, client.riderId);
      removeClient(client);
    }
  });

  ws.send(JSON.stringify({ type: 'connected', service: 'powderlink-ws' }));
});

// Ping/pong heartbeat to detect dead connections
const heartbeat = setInterval(() => {
  wss.clients.forEach((ws) => {
    if ((ws as any).__alive === false) {
      ws.terminate();
      return;
    }
    (ws as any).__alive = false;
    ws.ping();
  });
}, HEARTBEAT_INTERVAL);

wss.on('connection', (ws) => {
  (ws as any).__alive = true;
  ws.on('pong', () => {
    (ws as any).__alive = true;
  });
});

wss.on('close', () => {
  clearInterval(heartbeat);
});

// Dead Man's Switch watchdog — check every 30 seconds
const dmsInterval = setInterval(async () => {
  try {
    await checkDMS();
  } catch (err) {
    console.error('DMS check error:', err);
  }
}, 30_000);

// Count-Me-Out watchdog — check every 30 seconds alongside DMS
const cmoInterval = setInterval(async () => {
  try {
    await checkCountMeOut();
  } catch (err) {
    console.error('Count-me-out check error:', err);
  }
}, 30_000);

// Garmin inReach poller — check every 60 seconds (pro riders only)
const garminInterval = setInterval(async () => {
  try {
    await pollDueGarminFeeds();
  } catch (err) {
    console.error('Garmin poll error:', err);
  }
}, 60_000);

server.listen(PORT, () => {
  console.log(`PowderLink API listening on :${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(dmsInterval);
  clearInterval(cmoInterval);
  clearInterval(garminInterval);
  clearInterval(heartbeat);
  wss.close();
  server.close();
});
