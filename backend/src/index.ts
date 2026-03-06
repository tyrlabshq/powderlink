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
import trailRoutes from './routes/trails';
import emergencyRoutes from './routes/emergency';
import rideRoutes from './routes/rides';
import { addClient, removeClient, broadcastToGroup, WsClient } from './ws';
import { checkDMS } from './services/dms';

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
app.use('/trails', trailRoutes);
app.use('/emergency', emergencyRoutes);
app.use('/rides', rideRoutes);

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

server.listen(PORT, () => {
  console.log(`PowderLink API listening on :${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  clearInterval(dmsInterval);
  clearInterval(heartbeat);
  wss.close();
  server.close();
});
