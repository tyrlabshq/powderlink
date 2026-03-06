# Garmin inReach Integration (PL-10)

## Overview

PowderLink integrates with Garmin inReach satellite communicators to maintain
rider location tracking when cellular coverage drops. When a rider loses LTE,
their inReach device continues broadcasting GPS fixes over the Iridium satellite
network (every 2–10 minutes depending on device tracking interval setting).

The server polls each pro rider's Garmin MapShare feed and injects satellite
fixes into the normal location pipeline — the iOS app sees `source: "satellite"`
pings and displays them on the map identically to cellular fixes.

---

## How It Works

```
Rider's inReach Device
       │ (Iridium satellite)
       ▼
Garmin Explore servers (share.garmin.com)
       │ (MapShare KML feed, polled every 60s)
       ▼
PowderLink API (garmin.ts service)
       │ → garmin_pings table (raw satellite history)
       │ → rider_locations table (source='satellite')
       │ → WebSocket broadcast to group
       ▼
iOS App (shows satellite ping on map)
```

---

## API Keys / Credentials Needed

### Server-side: NONE required
Garmin MapShare feeds are public KML URLs. No Garmin API key is needed for the
polling service. Users provide their own MapShare identifier.

### User provides (via `/garmin/config`):
1. **MapShare Identifier** — Found in Garmin Explore account → Share tab
   - Format: alphanumeric string, e.g. `JohnSmith42`
   - Feed URL: `https://share.garmin.com/Feed/Share/{mapshare_id}`

2. **MapShare Password** (optional) — If the user set a password on their share
   - Passed as `extId` query param to the feed URL

3. **IMEI** (optional) — Device IMEI for multi-device accounts
   - Filters feed to a specific device
   - Found on device or at explore.garmin.com

### How users find their MapShare ID:
1. Log in to https://explore.garmin.com
2. Click "Social" tab → "MapShare" section
3. Enable MapShare if not already on
4. Copy the URL — the identifier is the last path segment:
   `https://share.garmin.com/JohnSmith42` → ID is `JohnSmith42`

---

## Enterprise API (Future)

For enterprise deployments with managed devices, Garmin offers a REST API:
- URL: https://explore.garmin.com/consumer/website/api
- Requires partnership with Garmin: https://explore.garmin.com/en-US/enterprise
- Provides: device management, inbound/outbound messaging, location history
- Auth: API key + device IMEI per device
- Use case: Ski patrol deploying inReach units to all guides without requiring
  individual MapShare setup

To enable enterprise mode, set in `.env`:
```
GARMIN_ENTERPRISE_API_KEY=your_enterprise_key
GARMIN_ENTERPRISE_API_URL=https://explore.garmin.com/consumer/website/api
```
(Service code for enterprise API is scaffolded but not yet implemented.)

---

## Data Flow Details

### Poll frequency
- Default: every 60 seconds per rider
- Minimum: 60 seconds (Garmin rate-limits more aggressive polling)
- Garmin inReach transmits every 2–10 minutes (device setting)
- Net result: satellite fix available within ~2 minutes of transmission

### Feed date window
- Each poll requests fixes from `(lastPoll - 1 min)` to `now`
- 1-minute overlap prevents missed fixes at poll boundary
- First-ever poll requests the last 1 hour

### Deduplication
- Each fix is keyed on `(rider_id, garmin_at)` timestamp
- Re-polling the same window never creates duplicates

### Source attribution
- All Garmin pings appear in `rider_locations` with `source = 'satellite'`
- WebSocket broadcasts include `source: "satellite"` so the app can display
  the satellite icon instead of the cellular dot

---

## Supported Garmin Devices
Any device that supports Garmin MapShare, including:
- inReach Mini / Mini 2
- inReach Explorer+
- inReach SE+
- Foretrex 601/701 (with inReach)
- Montana 700i
- GPSMAP 66i / 86i
- Fenix series with inReach (paired)

---

## Tier Gating
Garmin integration is **Pro-only**:
- `POST /garmin/config` — requires `requirePro` middleware
- `GET /garmin/pings` — requires `requirePro` middleware
- The poller (`pollDueGarminFeeds`) queries `WHERE r.tier = 'pro'`

Free riders cannot register a MapShare config and will not be polled.

---

## Testing

To test without a real inReach device, you can manually insert a garmin_ping:
```sql
INSERT INTO garmin_pings
  (rider_id, location, altitude_m, speed_kmh, heading, event_type, garmin_at)
VALUES
  ('your-rider-uuid',
   ST_SetSRID(ST_MakePoint(-106.5, 39.5), 4326),
   3000, 0, 180, 'Tracking', now());
```

Or point `mapshareId` at a public test account if available from Garmin's docs.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GARMIN_ENTERPRISE_API_KEY` | No | Enterprise API key (future use) |
| `GARMIN_ENTERPRISE_API_URL` | No | Enterprise API base URL (future use) |

No server-side keys needed for MapShare polling.
