import { Router, Request, Response } from 'express';
import { query } from '../db';
import { requireRider } from '../middleware/auth';
import { setDMS, snoozeDMS, disableDMS, getDMS, fireAlert } from '../services/dms';

const router = Router();

const VALID_INTERVALS = [5, 10, 15, 20, 30];

// POST /alerts/dms/set — Set dead man's switch
router.post('/dms/set', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  const { intervalMinutes, groupId } = req.body;

  if (!groupId) {
    res.status(400).json({ error: 'groupId is required' });
    return;
  }
  if (!VALID_INTERVALS.includes(intervalMinutes)) {
    res.status(400).json({ error: `intervalMinutes must be one of: ${VALID_INTERVALS.join(', ')}` });
    return;
  }

  // Verify membership
  const member = await query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND rider_id = $2',
    [groupId, riderId]
  );
  if (member.rows.length === 0) {
    res.status(403).json({ error: 'Not a member of this group' });
    return;
  }

  await setDMS(riderId, groupId, intervalMinutes);
  res.json({ ok: true, intervalMinutes });
});

// POST /alerts/dms/snooze — Snooze dead man's switch
router.post('/dms/snooze', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  const { minutes } = req.body;

  if (!minutes || minutes < 1 || minutes > 60) {
    res.status(400).json({ error: 'minutes must be between 1 and 60' });
    return;
  }

  const config = await getDMS(riderId);
  if (!config) {
    res.status(404).json({ error: 'No active DMS for this rider' });
    return;
  }

  await snoozeDMS(riderId, minutes);
  res.json({ ok: true, snoozedMinutes: minutes });
});

// POST /alerts/dms/disable — Disable dead man's switch
router.post('/dms/disable', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  await disableDMS(riderId);
  res.json({ ok: true });
});

// POST /alerts/fire — Fire a DMS alert from the app side
// Used when the client-side countdown expires with no rider response.
// The server-side watchdog (checkDMS cron) is the primary backstop; this fires immediately.
router.post('/fire', requireRider, async (req: Request, res: Response) => {
  const riderId = (req as any).riderId;
  const { groupId, lat, lng } = req.body as { groupId?: string; lat?: number; lng?: number };
  const location = lat != null && lng != null ? { lat, lng } : null;
  await fireAlert(riderId, groupId ?? '', 'dead_mans_switch', location);
  res.json({ ok: true });
});

// GET /alerts/:groupId — Get active alerts for group
router.get('/:groupId', requireRider, async (req: Request, res: Response) => {
  const { groupId } = req.params;

  const result = await query(
    `SELECT id, type, rider_id, group_id,
            ST_Y(location) AS lat, ST_X(location) AS lng,
            fired_at, acknowledged_at, acknowledged_by
     FROM alerts
     WHERE group_id = $1 AND acknowledged_at IS NULL
     ORDER BY fired_at DESC`,
    [groupId]
  );

  res.json(result.rows.map(row => ({
    id: row.id,
    type: row.type,
    riderId: row.rider_id,
    groupId: row.group_id,
    location: row.lat != null ? { lat: parseFloat(row.lat), lng: parseFloat(row.lng) } : null,
    firedAt: row.fired_at,
  })));
});

export default router;
