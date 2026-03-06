import { Router, Request, Response } from 'express';
import { query } from '../db';
import { requireRider } from '../middleware/auth';
import { broadcastToGroup } from '../ws';

const router = Router();

// ─── Douglas-Peucker Route Simplification ─────────────────────────────────────

interface Point { lat: number; lng: number; }

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const dx = lineEnd.lng - lineStart.lng;
  const dy = lineEnd.lat - lineStart.lat;
  if (dx === 0 && dy === 0) {
    return Math.sqrt(
      Math.pow(point.lat - lineStart.lat, 2) + Math.pow(point.lng - lineStart.lng, 2)
    );
  }
  const t = ((point.lng - lineStart.lng) * dx + (point.lat - lineStart.lat) * dy) / (dx * dx + dy * dy);
  const nearestLng = lineStart.lng + t * dx;
  const nearestLat = lineStart.lat + t * dy;
  return Math.sqrt(Math.pow(point.lat - nearestLat, 2) + Math.pow(point.lng - nearestLng, 2));
}

function douglasPeucker(points: Point[], epsilon: number): Point[] {
  if (points.length <= 2) return points;
  let maxDist = 0;
  let maxIdx = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpendicularDistance(points[i], points[0], points[points.length - 1]);
    if (d > maxDist) { maxDist = d; maxIdx = i; }
  }
  if (maxDist > epsilon) {
    const left = douglasPeucker(points.slice(0, maxIdx + 1), epsilon);
    const right = douglasPeucker(points.slice(maxIdx), epsilon);
    return [...left.slice(0, -1), ...right];
  }
  return [points[0], points[points.length - 1]];
}

// ─── Haversine Distance (miles) ───────────────────────────────────────────────

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Stats Calculation ────────────────────────────────────────────────────────

async function calculateRideStats(groupId: string, startedAt: Date, endedAt: Date) {
  // Fetch all location points for this group during the ride window
  const result = await query(
    `SELECT
       ST_Y(location) AS lat,
       ST_X(location) AS lng,
       speed_mph,
       altitude_ft,
       recorded_at
     FROM rider_locations
     WHERE group_id = $1
       AND recorded_at >= $2
       AND recorded_at <= $3
     ORDER BY recorded_at ASC`,
    [groupId, startedAt, endedAt]
  );

  const points = result.rows;
  if (points.length === 0) {
    return {
      distanceMiles: 0,
      durationSeconds: Math.round((endedAt.getTime() - startedAt.getTime()) / 1000),
      topSpeedMph: 0,
      avgSpeedMph: 0,
      maxAltitudeFt: 0,
      elevationGainFt: 0,
      elevationLossFt: 0,
      route: [],
      pointCount: 0,
    };
  }

  // Distance
  let totalDistance = 0;
  for (let i = 1; i < points.length; i++) {
    totalDistance += haversineMiles(
      parseFloat(points[i - 1].lat), parseFloat(points[i - 1].lng),
      parseFloat(points[i].lat), parseFloat(points[i].lng)
    );
  }

  // Speeds
  const speeds = points.map(p => parseFloat(p.speed_mph) || 0);
  const topSpeedMph = Math.max(...speeds);
  const durationSeconds = Math.round((endedAt.getTime() - startedAt.getTime()) / 1000);
  const durationHours = durationSeconds / 3600;
  const avgSpeedMph = durationHours > 0 ? totalDistance / durationHours : 0;

  // Altitude
  const altitudes = points.map(p => parseFloat(p.altitude_ft) || 0);
  const maxAltitudeFt = Math.max(...altitudes);
  let elevationGainFt = 0;
  let elevationLossFt = 0;
  for (let i = 1; i < altitudes.length; i++) {
    const diff = altitudes[i] - altitudes[i - 1];
    if (diff > 0) elevationGainFt += diff;
    else elevationLossFt += Math.abs(diff);
  }

  // Route polyline — simplify with Douglas-Peucker
  const rawRoute: Point[] = points.map(p => ({
    lat: parseFloat(p.lat),
    lng: parseFloat(p.lng),
  }));
  // epsilon ~0.00005 degrees ≈ 5 meters — reduces points while preserving shape
  const simplifiedRoute = douglasPeucker(rawRoute, 0.00005);

  return {
    distanceMiles: Math.round(totalDistance * 100) / 100,
    durationSeconds,
    topSpeedMph: Math.round(topSpeedMph * 10) / 10,
    avgSpeedMph: Math.round(avgSpeedMph * 10) / 10,
    maxAltitudeFt: Math.round(maxAltitudeFt),
    elevationGainFt: Math.round(elevationGainFt),
    elevationLossFt: Math.round(elevationLossFt),
    route: simplifiedRoute,
    pointCount: simplifiedRoute.length,
  };
}

// ─── POST /rides/start — Start a new ride for a group ─────────────────────────

router.post('/start', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  const { groupId, name } = req.body;

  if (!groupId) {
    res.status(400).json({ error: 'groupId is required' });
    return;
  }

  // Verify group membership
  const member = await query(
    'SELECT role FROM group_members WHERE group_id = $1 AND rider_id = $2',
    [groupId, riderId]
  );
  if (member.rows.length === 0) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  // Check no active ride for this group
  const existing = await query(
    'SELECT id FROM rides WHERE group_id = $1 AND ended_at IS NULL',
    [groupId]
  );
  if (existing.rows.length > 0) {
    res.status(409).json({ error: 'A ride is already active for this group', rideId: existing.rows[0].id });
    return;
  }

  const result = await query(
    `INSERT INTO rides (group_id, rider_id, name, started_at)
     VALUES ($1, $2, $3, now())
     RETURNING id, group_id, rider_id, name, started_at`,
    [groupId, riderId, name || null]
  );
  const ride = result.rows[0];

  // Broadcast to group that ride started
  broadcastToGroup(groupId, {
    type: 'ride_started',
    rideId: ride.id,
    startedAt: ride.started_at,
  });

  res.status(201).json({ rideId: ride.id, startedAt: ride.started_at });
});

// ─── POST /rides/:id/end — End ride + calculate stats ─────────────────────────

router.post('/:id/end', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  const { id } = req.params;

  // Fetch ride
  const rideResult = await query(
    'SELECT * FROM rides WHERE id = $1',
    [id]
  );
  if (rideResult.rows.length === 0) {
    res.status(404).json({ error: 'Ride not found' });
    return;
  }
  const ride = rideResult.rows[0];

  if (ride.ended_at) {
    res.status(409).json({ error: 'Ride already ended' });
    return;
  }

  // Verify member of the group
  const member = await query(
    'SELECT role FROM group_members WHERE group_id = $1 AND rider_id = $2',
    [ride.group_id, riderId]
  );
  if (member.rows.length === 0) {
    res.status(403).json({ error: 'Not a member of this ride\'s group' });
    return;
  }

  const endedAt = new Date();
  const stats = await calculateRideStats(ride.group_id, new Date(ride.started_at), endedAt);

  await query(
    'UPDATE rides SET ended_at = $1, stats = $2 WHERE id = $3',
    [endedAt, JSON.stringify(stats), id]
  );

  // Broadcast to group
  broadcastToGroup(ride.group_id, {
    type: 'ride_ended',
    rideId: id,
    endedAt: endedAt.toISOString(),
    stats,
  });

  res.json({
    rideId: id,
    endedAt: endedAt.toISOString(),
    stats,
  });
});

// ─── GET /rides/:id — Get ride with stats + route ─────────────────────────────

router.get('/:id', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  const { id } = req.params;

  const result = await query(
    `SELECT r.*, g.name AS group_name, g.code AS group_code
     FROM rides r
     JOIN groups g ON g.id = r.group_id
     WHERE r.id = $1`,
    [id]
  );
  if (result.rows.length === 0) {
    res.status(404).json({ error: 'Ride not found' });
    return;
  }
  const ride = result.rows[0];

  // Verify access — must have been member of that group
  const member = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND rider_id = $2',
    [ride.group_id, riderId]
  );
  if (member.rows.length === 0) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  res.json({
    rideId: ride.id,
    groupId: ride.group_id,
    groupName: ride.group_name,
    groupCode: ride.group_code,
    name: ride.name,
    startedAt: ride.started_at,
    endedAt: ride.ended_at,
    stats: ride.stats,
  });
});

// ─── GET /rides/history/:riderId — Last 30 rides for a rider ──────────────────

router.get('/history/:riderId', requireRider, async (req: Request, res: Response) => {
  const requesterId = (req as any).riderId;
  const { riderId } = req.params;

  // Only allow fetching your own history
  if (requesterId !== riderId) {
    res.status(403).json({ error: 'Can only view your own ride history' });
    return;
  }

  // Rides where this rider was the one who started/ended, OR was a member of the group
  const result = await query(
    `SELECT r.id, r.group_id, r.name, r.started_at, r.ended_at, r.stats,
            g.name AS group_name, g.code AS group_code
     FROM rides r
     JOIN groups g ON g.id = r.group_id
     JOIN group_members gm ON gm.group_id = r.group_id AND gm.rider_id = $1
     WHERE r.ended_at IS NOT NULL
     ORDER BY r.started_at DESC
     LIMIT 30`,
    [riderId]
  );

  res.json(result.rows.map(r => ({
    rideId: r.id,
    groupId: r.group_id,
    groupName: r.group_name,
    name: r.name,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    stats: r.stats,
  })));
});

// ─── GET /rides/group/:groupId/active — Get active ride for a group ───────────

router.get('/group/:groupId/active', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  const { groupId } = req.params;

  // Verify membership
  const member = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND rider_id = $2',
    [groupId, riderId]
  );
  if (member.rows.length === 0) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  const result = await query(
    'SELECT id, started_at FROM rides WHERE group_id = $1 AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1',
    [groupId]
  );

  if (result.rows.length === 0) {
    res.json({ active: false });
    return;
  }

  res.json({
    active: true,
    rideId: result.rows[0].id,
    startedAt: result.rows[0].started_at,
  });
});

export default router;
