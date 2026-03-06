export interface Rider {
  id: string;
  name: string;
  avatarUrl?: string;
  emergencyContact: EmergencyContact;
  medicalInfo: MedicalInfo;
}

export interface EmergencyContact {
  name: string;
  phone: string;
  relationship: string;
}

export interface MedicalInfo {
  bloodType?: string;
  allergies?: string[];
  medications?: string[];
  conditions?: string[];
}

export interface RiderLocation {
  riderId: string;
  lat: number;
  lng: number;
  heading?: number;
  speedMph?: number;
  altitudeFt?: number;
  timestamp: number;
  source: 'cellular' | 'satellite' | 'ble_mesh';
  accuracy?: number;
}

export interface Group {
  id: string;
  code: string; // 6-char join code
  name: string;
  leaderId: string;
  sweepId?: string;
  members: Rider[];
  rallyPoint?: LatLng;
  createdAt: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface TrailCondition {
  id: string;
  trailId: string;
  condition: 'groomed' | 'rough' | 'icy' | 'drifted' | 'closed' | 'unknown';
  reportedBy: string;
  reportedAt: number;
  notes?: string;
  lat: number;
  lng: number;
}

export interface Alert {
  id: string;
  type: 'dead_mans_switch' | 'crash_detected' | 'sos' | 'rally_point' | 'count_me_out_expired';
  riderId: string;
  groupId: string;
  location: LatLng;
  timestamp: number;
  acknowledged: boolean;
}

export type SignalSource = 'cellular' | 'satellite' | 'offline';
