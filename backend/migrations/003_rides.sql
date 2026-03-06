-- PowderLink rides enhancements
-- Add rider_id to rides for per-rider history, plus indexes

ALTER TABLE rides ADD COLUMN IF NOT EXISTS rider_id uuid REFERENCES riders(id);
ALTER TABLE rides ADD COLUMN IF NOT EXISTS name text;

-- Index for rider history queries
CREATE INDEX IF NOT EXISTS idx_rides_rider ON rides(rider_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_rides_group ON rides(group_id, started_at DESC);

-- Ensure stats column exists (was in 001 but guard it)
ALTER TABLE rides ALTER COLUMN stats SET DEFAULT '{}';
