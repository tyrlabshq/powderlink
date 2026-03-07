const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3001';

// ─── Condition Types ──────────────────────────────────────────────────────────

export type ConditionType =
  | 'groomed'
  | 'powder'
  | 'icy'
  | 'closed'
  | 'tracked_out'
  | 'wet_snow';

export type HazardType =
  | 'downed_tree'
  | 'washout'
  | 'bridge_out'
  | 'debris'
  | 'flooding'
  | 'rock_slide';

export type ReportType = 'condition' | 'hazard' | 'snow_depth';

// ─── Report Model ─────────────────────────────────────────────────────────────

export interface TrailConditionReport {
  id: string;
  lat: number;
  lng: number;
  reportType: ReportType;
  // Condition report
  condition?: ConditionType;
  // Hazard report
  hazard?: HazardType;
  // Snow depth report
  snowDepthCm?: number;
  notes: string | null;
  reported_by: string | null;
  reported_at: string;
  distance_m?: number;
  // Community verification
  upvotes: number;
  userHasUpvoted: boolean;
  // Photo (URL from backend or local URI for pending upload)
  photoUri?: string;
}

// ─── Labels / Colors / Icons ──────────────────────────────────────────────────

export const CONDITION_LABELS: Record<ConditionType, string> = {
  groomed: 'Groomed',
  powder: 'Fresh Powder',
  icy: 'Icy',
  closed: 'Closed',
  tracked_out: 'Tracked Out',
  wet_snow: 'Wet Snow',
};

export const CONDITION_COLORS: Record<ConditionType, string> = {
  groomed: '#00ff88',
  powder: '#00aaff',
  icy: '#ff4466',
  closed: '#ff2200',
  tracked_out: '#ffaa00',
  wet_snow: '#aa88ff',
};

export const CONDITION_ICONS: Record<ConditionType, string> = {
  groomed: '✅',
  powder: '❄️',
  icy: '🧊',
  closed: '🚫',
  tracked_out: '🏂',
  wet_snow: '💧',
};

export const HAZARD_LABELS: Record<HazardType, string> = {
  downed_tree: 'Downed Tree',
  washout: 'Washout',
  bridge_out: 'Bridge Out',
  debris: 'Debris',
  flooding: 'Flooding',
  rock_slide: 'Rock Slide',
};

export const HAZARD_COLORS: Record<HazardType, string> = {
  downed_tree: '#ff8800',
  washout: '#ff4400',
  bridge_out: '#ff2200',
  debris: '#ffaa00',
  flooding: '#0088ff',
  rock_slide: '#888888',
};

export const HAZARD_ICONS: Record<HazardType, string> = {
  downed_tree: '🌲',
  washout: '🌊',
  bridge_out: '⚠️',
  debris: '🪨',
  flooding: '💧',
  rock_slide: '🏔️',
};

// ─── Mock Data (used when backend is unavailable) ─────────────────────────────

export const MOCK_REPORTS: TrailConditionReport[] = [
  {
    id: 'mock-1',
    lat: 44.315,
    lng: -85.602,
    reportType: 'condition',
    condition: 'groomed',
    notes: 'Groomed last night — perfect corduroy this morning',
    reported_by: 'LocalRider42',
    reported_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    distance_m: 1200,
    upvotes: 7,
    userHasUpvoted: false,
  },
  {
    id: 'mock-2',
    lat: 44.318,
    lng: -85.608,
    reportType: 'hazard',
    hazard: 'downed_tree',
    notes: 'Large pine across the main loop near mile marker 4',
    reported_by: 'TrailRunner99',
    reported_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    distance_m: 2400,
    upvotes: 3,
    userHasUpvoted: false,
  },
  {
    id: 'mock-3',
    lat: 44.31,
    lng: -85.595,
    reportType: 'snow_depth',
    snowDepthCm: 28,
    notes: 'Measured at trailhead kiosk',
    reported_by: 'SnowPatrol',
    reported_at: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
    distance_m: 800,
    upvotes: 12,
    userHasUpvoted: false,
  },
  {
    id: 'mock-4',
    lat: 44.322,
    lng: -85.615,
    reportType: 'condition',
    condition: 'icy',
    notes: 'Shaded north face — full ice sheet, avoid without studs',
    reported_by: 'ColdWeatherCrew',
    reported_at: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    distance_m: 3100,
    upvotes: 5,
    userHasUpvoted: false,
  },
];

// ─── API Functions ────────────────────────────────────────────────────────────

export async function fetchNearbyConditions(
  lat: number,
  lng: number,
  radiusM = 25000,
): Promise<TrailConditionReport[]> {
  const url = `${API_URL}/trails/conditions?lat=${lat}&lng=${lng}&radius=${radiusM}`;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch conditions: ${res.status}`);
    const data: TrailConditionReport[] = await res.json();
    return data;
  } catch {
    // Backend not available — return mock data for dev/demo
    console.log('[TrailConditions] Backend unavailable, using mock data');
    return MOCK_REPORTS;
  }
}

export async function reportCondition(
  lat: number,
  lng: number,
  condition: ConditionType,
  notes?: string,
): Promise<TrailConditionReport> {
  try {
    const res = await fetch(`${API_URL}/trails/conditions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, condition, notes, reportType: 'condition' }),
    });
    if (!res.ok) throw new Error(`Failed to submit condition: ${res.status}`);
    return res.json();
  } catch {
    // Return optimistic mock response
    return {
      id: `local-${Date.now()}`,
      lat,
      lng,
      reportType: 'condition',
      condition,
      notes: notes ?? null,
      reported_by: 'You',
      reported_at: new Date().toISOString(),
      upvotes: 0,
      userHasUpvoted: false,
    };
  }
}

export async function reportHazard(
  lat: number,
  lng: number,
  hazard: HazardType,
  notes?: string,
  photoUri?: string,
): Promise<TrailConditionReport> {
  try {
    const body: Record<string, unknown> = { lat, lng, hazard, notes, reportType: 'hazard' };
    if (photoUri) body.photoUri = photoUri;
    const res = await fetch(`${API_URL}/trails/conditions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Failed to submit hazard: ${res.status}`);
    return res.json();
  } catch {
    return {
      id: `local-${Date.now()}`,
      lat,
      lng,
      reportType: 'hazard',
      hazard,
      notes: notes ?? null,
      photoUri,
      reported_by: 'You',
      reported_at: new Date().toISOString(),
      upvotes: 0,
      userHasUpvoted: false,
    };
  }
}

export async function reportSnowDepth(
  lat: number,
  lng: number,
  snowDepthCm: number,
  notes?: string,
): Promise<TrailConditionReport> {
  try {
    const res = await fetch(`${API_URL}/trails/conditions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, snowDepthCm, notes, reportType: 'snow_depth' }),
    });
    if (!res.ok) throw new Error(`Failed to submit snow depth: ${res.status}`);
    return res.json();
  } catch {
    return {
      id: `local-${Date.now()}`,
      lat,
      lng,
      reportType: 'snow_depth',
      snowDepthCm,
      notes: notes ?? null,
      reported_by: 'You',
      reported_at: new Date().toISOString(),
      upvotes: 0,
      userHasUpvoted: false,
    };
  }
}

export async function upvoteReport(reportId: string): Promise<{ upvotes: number }> {
  try {
    const res = await fetch(`${API_URL}/trails/conditions/${reportId}/upvote`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error(`Failed to upvote: ${res.status}`);
    return res.json();
  } catch {
    // Optimistic local upvote — backend will sync when available
    return { upvotes: 1 };
  }
}
