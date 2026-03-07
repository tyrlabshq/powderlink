import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Switch,
  Vibration,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapboxGL from '@rnmapbox/maps';
import { colors } from '../theme/colors';
import { useGroupWebSocket, type MemberLocation } from '../hooks/useGroupWebSocket';
import { MemberPin } from '../components/MemberPin';
import { MemberListPanel } from '../components/MemberListPanel';
import { getAvalancheGeoJSON, type AvalancheGeoJSON, cacheAge } from '../services/avalanche';
import { fetchPOIs, type POI, POI_COLORS } from '../services/poi';
import { autoDownloadAroundLocation } from '../services/offlineMaps';
import { useTrailSnapping } from '../hooks/useTrailSnapping';
import { getTrailsGeoJSON } from '../services/TrailSnapping';
import { suggestRoutes, formatDistanceM, type RouteSuggestion } from '../services/TrailRouting';
import { fetchNearbyConditions, type TrailConditionReport } from '../api/trailConditions';
import { TrailConditionModal } from '../components/TrailConditionModal';
import { RecentConditionsPanel } from '../components/RecentConditionsPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getRelativeTime(timestamp: string): string {
  const ms = Date.now() - new Date(timestamp).getTime();
  if (isNaN(ms) || ms < 0) return 'just now';
  const seconds = Math.floor(ms / 1000);
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}

function getBatteryColor(battery: number): string {
  if (battery > 50) return colors.success;
  if (battery > 20) return '#ffaa00';
  return colors.danger;
}

// ---------------------------------------------------------------------------
// Trail condition colors (from API types)
// ---------------------------------------------------------------------------
const CONDITION_DOT_COLORS: Record<string, string> = {
  groomed: '#00ff88',
  powder: '#00aaff',
  icy: '#ff4466',
  closed: '#ff2200',
  tracked_out: '#ffaa00',
  wet_snow: '#aa88ff',
};

// ---------------------------------------------------------------------------
// Map style — outdoors-v12 shows hiking/biking/snow trails natively
// ---------------------------------------------------------------------------
const MAP_STYLE_URL = 'mapbox://styles/mapbox/outdoors-v12';

// ---------------------------------------------------------------------------
// Trail layer — OSM paths/tracks from streets-v8 tileset
// ---------------------------------------------------------------------------
function TrailLayer() {
  return (
    <MapboxGL.VectorSource id="trail-source" url="mapbox://mapbox.mapbox-streets-v8">
      <MapboxGL.LineLayer
        id="offroad-trails"
        sourceLayerID="road"
        filter={['in', ['get', 'class'], ['literal', ['path', 'track']]]}
        style={{
          lineColor: ['match', ['get', 'class'], 'path', '#00ff88', 'track', '#ffcc00', '#00aaff'] as any,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 1, 12, 2, 15, 3.5] as any,
          lineOpacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </MapboxGL.VectorSource>
  );
}

// ---------------------------------------------------------------------------
// Difficulty colors for OSM trail overlay
// ---------------------------------------------------------------------------
const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#00dd66',
  moderate: '#ffaa00',
  hard: '#ff3355',
  unknown: '#6699cc',
};

// ---------------------------------------------------------------------------
// Trail difficulty overlay — rendered from live OSM Overpass data
// ---------------------------------------------------------------------------
function TrailDifficultyLayer({ geojson }: { geojson: GeoJSON.FeatureCollection }) {
  if (geojson.features.length === 0) return null;
  return (
    <MapboxGL.ShapeSource id="trail-difficulty-source" shape={geojson}>
      {/* Halo for contrast */}
      <MapboxGL.LineLayer
        id="trail-difficulty-halo"
        style={{
          lineColor: 'rgba(0,0,0,0.4)',
          lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 3, 14, 6] as any,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.5,
        }}
      />
      {/* Coloured difficulty line */}
      <MapboxGL.LineLayer
        id="trail-difficulty-line"
        style={{
          lineColor: [
            'match', ['get', 'difficulty'],
            'easy', DIFFICULTY_COLORS.easy,
            'moderate', DIFFICULTY_COLORS.moderate,
            'hard', DIFFICULTY_COLORS.hard,
            DIFFICULTY_COLORS.unknown,
          ] as any,
          lineWidth: ['interpolate', ['linear'], ['zoom'], 8, 1.5, 12, 2.5, 15, 4] as any,
          lineCap: 'round',
          lineJoin: 'round',
          lineOpacity: 0.9,
        }}
      />
    </MapboxGL.ShapeSource>
  );
}

// ---------------------------------------------------------------------------
// Snapped position indicator — blue pulse dot on trail
// ---------------------------------------------------------------------------
function SnappedPositionLayer({ coord }: { coord: [number, number] }) {
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: coord },
      properties: {},
    }],
  };
  return (
    <MapboxGL.ShapeSource id="snapped-position-source" shape={geojson}>
      <MapboxGL.CircleLayer
        id="snapped-position-outer"
        style={{
          circleRadius: 14,
          circleColor: 'rgba(0,170,255,0.2)',
          circleStrokeColor: 'rgba(0,170,255,0.6)',
          circleStrokeWidth: 1.5,
        }}
      />
      <MapboxGL.CircleLayer
        id="snapped-position-inner"
        style={{
          circleRadius: 6,
          circleColor: colors.accent,
          circleStrokeColor: '#fff',
          circleStrokeWidth: 2,
        }}
      />
    </MapboxGL.ShapeSource>
  );
}

// ---------------------------------------------------------------------------
// Suggested route overlay
// ---------------------------------------------------------------------------
function SuggestedRouteLayer({ route }: { route: RouteSuggestion }) {
  const color = DIFFICULTY_COLORS[route.difficulty] ?? DIFFICULTY_COLORS.unknown;
  return (
    <MapboxGL.ShapeSource id="suggested-route-source" shape={route.path}>
      <MapboxGL.LineLayer
        id="suggested-route-line"
        style={{
          lineColor: color,
          lineWidth: 4,
          lineDasharray: [4, 3],
          lineOpacity: 0.85,
          lineCap: 'round',
          lineJoin: 'round',
        }}
      />
    </MapboxGL.ShapeSource>
  );
}

// ---------------------------------------------------------------------------
// Route suggestions panel
// ---------------------------------------------------------------------------
function RouteSuggestionsPanel({
  visible,
  suggestions,
  selectedIndex,
  onSelectRoute,
  onClose,
}: {
  visible: boolean;
  suggestions: RouteSuggestion[];
  selectedIndex: number | null;
  onSelectRoute: (index: number) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={styles.routePanel}>
      <View style={styles.routePanelHeader}>
        <Text style={styles.routePanelTitle}>Nearby Routes</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.routePanelClose}>✕</Text>
        </TouchableOpacity>
      </View>
      {suggestions.length === 0 ? (
        <Text style={styles.routeEmpty}>No connected trails found nearby.</Text>
      ) : (
        suggestions.map((route, i) => (
          <TouchableOpacity
            key={i}
            style={[styles.routeItem, selectedIndex === i && styles.routeItemSelected]}
            onPress={() => onSelectRoute(i)}
          >
            <View style={[styles.routeDot, { backgroundColor: DIFFICULTY_COLORS[route.difficulty] ?? '#6699cc' }]} />
            <View style={styles.routeInfo}>
              <Text style={styles.routeName} numberOfLines={1}>{route.name}</Text>
              <Text style={styles.routeMeta}>
                {formatDistanceM(route.totalDistanceM)} · {route.difficulty}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Avalanche overlay
// ---------------------------------------------------------------------------
function AvalancheLayer({ data }: { data: AvalancheGeoJSON }) {
  const fillColor: any = [
    'case',
    ['==', ['get', 'danger'], 'Low'], '#00cc44',
    ['==', ['get', 'danger'], 'Moderate'], '#ffdd00',
    ['==', ['get', 'danger'], 'Considerable'], '#ff8800',
    ['==', ['get', 'danger'], 'High'], '#ff2200',
    ['==', ['get', 'danger'], 'Extreme'], '#1a1a1a',
    '#444466',
  ];
  return (
    <MapboxGL.ShapeSource id="avalanche-source" shape={data as any}>
      <MapboxGL.FillLayer id="avalanche-fill" style={{ fillColor, fillOpacity: 0.32 }} />
      <MapboxGL.LineLayer id="avalanche-outline" style={{ lineColor: fillColor, lineWidth: 1.5, lineOpacity: 0.7 }} />
    </MapboxGL.ShapeSource>
  );
}

// ---------------------------------------------------------------------------
// POI layer
// ---------------------------------------------------------------------------
function POILayer({ pois }: { pois: POI[] }) {
  if (pois.length === 0) return null;
  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: pois.map((p) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lng, p.lat] },
      properties: { id: p.id, type: p.type, name: p.name },
    })),
  };
  return (
    <MapboxGL.ShapeSource id="poi-source" shape={geojson} cluster={false}>
      <MapboxGL.CircleLayer
        id="poi-circles"
        style={{
          circleRadius: 8,
          circleColor: ['match', ['get', 'type'], 'fuel', POI_COLORS.fuel, 'parking', POI_COLORS.parking, 'warming_hut', POI_COLORS.warming_hut, '#888888'] as any,
          circleStrokeColor: '#fff',
          circleStrokeWidth: 1.5,
          circleOpacity: 0.92,
        }}
      />
    </MapboxGL.ShapeSource>
  );
}

// ---------------------------------------------------------------------------
// Condition report dots
// ---------------------------------------------------------------------------
function ConditionLayer({ reports }: { reports: TrailConditionReport[] }) {
  if (reports.length === 0) return null;

  function getDotColor(r: TrailConditionReport): string {
    if (r.reportType === 'condition' && r.condition) {
      return CONDITION_DOT_COLORS[r.condition] ?? '#888888';
    }
    if (r.reportType === 'hazard') return '#ff8800';
    if (r.reportType === 'snow_depth') return '#00aaff';
    return '#888888';
  }

  const geojson: GeoJSON.FeatureCollection = {
    type: 'FeatureCollection',
    features: reports.map((r) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
      properties: {
        condition: r.condition ?? '',
        reportType: r.reportType,
        dotColor: getDotColor(r),
      },
    })),
  };
  return (
    <MapboxGL.ShapeSource id="conditions-source" shape={geojson}>
      <MapboxGL.CircleLayer
        id="conditions-circles"
        style={{
          circleRadius: ['interpolate', ['linear'], ['zoom'], 8, 5, 14, 10] as any,
          circleColor: ['get', 'dotColor'] as any,
          circleOpacity: 0.9,
          circleStrokeColor: 'rgba(0,0,0,0.5)',
          circleStrokeWidth: 1,
        }}
      />
    </MapboxGL.ShapeSource>
  );
}

// ---------------------------------------------------------------------------
// Reconnecting banner — respects notch/Dynamic Island
// ---------------------------------------------------------------------------
function ReconnectingBanner() {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.reconnectBanner, { top: insets.top }]}>
      <Text style={styles.reconnectText}>⚠️ Reconnecting to server…</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Distance helper (Haversine)
// ---------------------------------------------------------------------------
function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

// ---------------------------------------------------------------------------
// Member detail bottom sheet
// ---------------------------------------------------------------------------
function MemberDetailSheet({
  member,
  userCoords,
  isFollowing,
  onClose,
  onToggleFollow,
}: {
  member: MemberLocation;
  userCoords: [number, number] | null;
  isFollowing: boolean;
  onClose: () => void;
  onToggleFollow: () => void;
}) {
  const distance = userCoords
    ? haversineMeters(userCoords[1], userCoords[0], member.lat, member.lng)
    : null;

  return (
    <View style={styles.detailSheet}>
      <View style={styles.sheetHeader}>
        <Text style={styles.sheetName}>{member.userId}</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.sheetClose}>✕</Text>
        </TouchableOpacity>
      </View>

      {distance !== null && (
        <View style={styles.sheetRow}>
          <Text style={styles.sheetLabel}>Distance</Text>
          <Text style={styles.sheetValue}>{formatDistance(distance)}</Text>
        </View>
      )}
      <View style={styles.sheetRow}>
        <Text style={styles.sheetLabel}>Speed</Text>
        <Text style={styles.sheetValue}>{Math.round(member.speed)} mph</Text>
      </View>
      <View style={styles.sheetRow}>
        <Text style={styles.sheetLabel}>Battery</Text>
        <Text style={[styles.sheetValue, { color: getBatteryColor(member.battery) }]}>{member.battery}%</Text>
      </View>
      <View style={styles.sheetRow}>
        <Text style={styles.sheetLabel}>Last Update</Text>
        <Text style={styles.sheetValue}>{getRelativeTime(member.timestamp)}</Text>
      </View>

      <TouchableOpacity
        style={[styles.followBtn, isFollowing && styles.followBtnActive]}
        onPress={onToggleFollow}
      >
        <Text style={[styles.followBtnText, isFollowing && styles.followBtnTextActive]}>
          {isFollowing ? '🔴 Stop Following' : '📍 Follow on Map'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Layer toggle panel
// ---------------------------------------------------------------------------
function LayerRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.layerRow}>
      <Text style={styles.layerLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.accent, false: colors.textDim }} thumbColor="#fff" ios_backgroundColor={colors.textDim} />
    </View>
  );
}

function LayerToggles({
  showTrails, showAvalanche, showPOI, showConditions, showDifficulty, snapToTrailEnabled,
  onTrails, onAvalanche, onPOI, onConditions, onDifficulty, onSnapToTrail,
}: {
  showTrails: boolean; showAvalanche: boolean; showPOI: boolean; showConditions: boolean;
  showDifficulty: boolean; snapToTrailEnabled: boolean;
  onTrails: (v: boolean) => void; onAvalanche: (v: boolean) => void;
  onPOI: (v: boolean) => void; onConditions: (v: boolean) => void;
  onDifficulty: (v: boolean) => void; onSnapToTrail: (v: boolean) => void;
}) {
  return (
    <View style={styles.layerPanel}>
      <LayerRow label="Trails" value={showTrails} onChange={onTrails} />
      <LayerRow label="Trail Difficulty" value={showDifficulty} onChange={onDifficulty} />
      <LayerRow label="Snap to Trail" value={snapToTrailEnabled} onChange={onSnapToTrail} />
      <LayerRow label="Avalanche" value={showAvalanche} onChange={onAvalanche} />
      <LayerRow label="POI" value={showPOI} onChange={onPOI} />
      <LayerRow label="Conditions" value={showConditions} onChange={onConditions} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------
const DEFAULT_CENTER: [number, number] = [-84.9573, 46.3539];

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const hudTop = insets.top + 12;
  const {
    members,
    connected,
    sweepGap,
    cmoWarning,
    dismissCmoWarning,
    sweepLeaderAlert,
    dismissSweepLeaderAlert,
  } = useGroupWebSocket();

  const [selectedMember, setSelectedMember] = useState<MemberLocation | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [layerPanelVisible, setLayerPanelVisible] = useState(false);
  const [userCoords, setUserCoords] = useState<[number, number] | null>(null);

  // Layer data
  const [avalancheData, setAvalancheData] = useState<AvalancheGeoJSON | null>(null);
  const [pois, setPois] = useState<POI[]>([]);
  const [conditionReports, setConditionReports] = useState<TrailConditionReport[]>([]);

  // Layer visibility
  const [showTrails, setShowTrails] = useState(true);
  const [showAvalanche, setShowAvalanche] = useState(true);
  const [showPOI, setShowPOI] = useState(true);
  const [showConditions, setShowConditions] = useState(true);
  const [showDifficulty, setShowDifficulty] = useState(true);

  // Snap-to-trail state
  const { snappedCoord, activeTrail, snapEnabled, setSnapEnabled, isLoading: snapLoading } =
    useTrailSnapping(userCoords);
  const [trailsGeoJSON, setTrailsGeoJSON] = useState<GeoJSON.FeatureCollection>({
    type: 'FeatureCollection',
    features: [],
  });
  const [routeSuggestions, setRouteSuggestions] = useState<RouteSuggestion[]>([]);
  const [routePanelVisible, setRoutePanelVisible] = useState(false);
  const [selectedRouteIndex, setSelectedRouteIndex] = useState<number | null>(null);

  // Trail conditions panel + report modal
  const [conditionsPanelVisible, setConditionsPanelVisible] = useState(false);
  const [conditionReportModalVisible, setConditionReportModalVisible] = useState(false);

  // Follow mode — camera tracks a specific member
  const [followUserId, setFollowUserId] = useState<string | null>(null);

  const cameraRef = useRef<MapboxGL.Camera>(null);
  const autoDownloadDone = useRef(false);

  const memberList = Array.from(members.values());

  // Load avalanche data on mount
  useEffect(() => {
    getAvalancheGeoJSON().then((data) => { if (data) setAvalancheData(data); });
  }, []);

  // Load POIs and conditions when we have a user location
  useEffect(() => {
    if (!userCoords) return;
    const [lng, lat] = userCoords;
    const delta = 0.5;
    fetchPOIs([[lng - delta, lat - delta], [lng + delta, lat + delta]]).then(setPois);
    fetchNearbyConditions(lat, lng).then(setConditionReports).catch(() => {});
  }, [userCoords]);

  // Auto-download region around user location on WiFi
  useEffect(() => {
    if (!userCoords || autoDownloadDone.current) return;
    autoDownloadDone.current = true;
    const [lng, lat] = userCoords;
    autoDownloadAroundLocation(lat, lng, 'auto-current-location').catch(() => {});
  }, [userCoords]);

  // Refresh trail GeoJSON after snapping updates (snap service loads new data)
  useEffect(() => {
    if (!snappedCoord) return;
    // Slight delay to let TrailSnapping finish loading Overpass data
    const timer = setTimeout(() => {
      setTrailsGeoJSON(getTrailsGeoJSON());
    }, 500);
    return () => clearTimeout(timer);
  }, [snappedCoord, snapLoading]);

  // Refresh route suggestions when snapped position changes
  useEffect(() => {
    if (!snappedCoord) return;
    const [lng, lat] = snappedCoord;
    const suggestions = suggestRoutes(lat, lng);
    setRouteSuggestions(suggestions);
  }, [snappedCoord]);

  // Follow mode — pan camera to tracked member whenever their location updates
  useEffect(() => {
    if (!followUserId || !cameraRef.current) return;
    const target = members.get(followUserId);
    if (!target) return;
    cameraRef.current.setCamera({
      centerCoordinate: [target.lng, target.lat],
      zoomLevel: 15,
      animationDuration: 400,
    });
  }, [followUserId, members]);

  // Vibrate on sweep gap alert
  useEffect(() => {
    if (sweepGap?.alert) {
      Vibration.vibrate([0, 200, 100, 200]);
    }
  }, [sweepGap?.alert]);

  // CMO 2-minute warning
  useEffect(() => {
    if (!cmoWarning) return;
    Alert.alert(
      '2-Minute Warning',
      "Your count-me-out timer expires in 2 minutes. Tap \"I'm Back\" on the dashboard if you've rejoined.",
      [{ text: 'OK', onPress: dismissCmoWarning }],
    );
  }, [cmoWarning, dismissCmoWarning]);

  // Sweep leader alert
  useEffect(() => {
    if (!sweepLeaderAlert) return;
    Alert.alert('Sweep Alert', sweepLeaderAlert, [{ text: 'OK', onPress: dismissSweepLeaderAlert }]);
  }, [sweepLeaderAlert, dismissSweepLeaderAlert]);

  const handleMemberPress = useCallback((member: MemberLocation) => {
    setPanelVisible(false);
    setConditionsPanelVisible(false);
    setSelectedMember(member);
  }, []);

  const handleMapPress = useCallback(() => {
    setSelectedMember(null);
    setLayerPanelVisible(false);
    setConditionsPanelVisible(false);
  }, []);

  const handleCenterOnMe = useCallback(() => {
    if (!cameraRef.current) return;
    const center = userCoords ?? DEFAULT_CENTER;
    cameraRef.current.setCamera({ centerCoordinate: center, zoomLevel: 14, animationDuration: 600 });
  }, [userCoords]);

  const handleUserLocationUpdate = useCallback((location: MapboxGL.Location) => {
    const { longitude, latitude } = location.coords;
    setUserCoords([longitude, latitude]);
  }, []);

  return (
    <View style={styles.container}>
      <MapboxGL.MapView style={styles.map} styleURL={MAP_STYLE_URL} onPress={handleMapPress}>
        <MapboxGL.Camera ref={cameraRef} zoomLevel={12} centerCoordinate={DEFAULT_CENTER} animationMode="flyTo" />
        <MapboxGL.UserLocation visible onUpdate={handleUserLocationUpdate} />

        {showTrails && <TrailLayer />}
        {showDifficulty && <TrailDifficultyLayer geojson={trailsGeoJSON} />}
        {showAvalanche && avalancheData && <AvalancheLayer data={avalancheData} />}
        {showPOI && <POILayer pois={pois} />}
        {showConditions && <ConditionLayer reports={conditionReports} />}
        {selectedRouteIndex !== null && routeSuggestions[selectedRouteIndex] && (
          <SuggestedRouteLayer route={routeSuggestions[selectedRouteIndex]} />
        )}
        {snapEnabled && snappedCoord && <SnappedPositionLayer coord={snappedCoord} />}

        {memberList.map((member) => (
          <MapboxGL.MarkerView key={member.userId} coordinate={[member.lng, member.lat]}>
            <MemberPin member={member} onPress={handleMemberPress} />
          </MapboxGL.MarkerView>
        ))}
      </MapboxGL.MapView>

      {!connected && memberList.length > 0 && <ReconnectingBanner />}

      {/* HUD */}
      <View style={[styles.hud, { top: hudTop }]}>
        <Text style={[styles.hudText, { color: connected ? colors.success : colors.danger }]}>
          {connected ? 'LIVE' : 'OFFLINE'}
        </Text>
        <Text style={styles.hudText}>Group {memberList.length}</Text>
        {avalancheData && <Text style={styles.hudTextSm}>Avalanche {cacheAge(avalancheData)}</Text>}
        {sweepGap && sweepGap.alert && (
          <Text style={[styles.hudTextSm, { color: colors.danger }]}>
            Sweep Gap {sweepGap.distanceMiles.toFixed(1)}mi
          </Text>
        )}
        {snapEnabled && activeTrail && (
          <Text style={[styles.hudTextSm, { color: DIFFICULTY_COLORS[activeTrail.difficulty] ?? colors.accent }]}>
            📍 {activeTrail.name || 'Trail'}
          </Text>
        )}
        {snapEnabled && !activeTrail && snappedCoord && !snapLoading && (
          <Text style={[styles.hudTextSm, { color: colors.textDim }]}>Off trail</Text>
        )}
        {snapLoading && <Text style={[styles.hudTextSm, { color: colors.textDim }]}>Loading trails…</Text>}
      </View>

      {/* Layer toggle button */}
      <TouchableOpacity style={[styles.layerBtn, { top: hudTop }]} onPress={() => { setLayerPanelVisible((v) => !v); setSelectedMember(null); setPanelVisible(false); }}>
        <Text style={styles.layerBtnText}>Layers</Text>
      </TouchableOpacity>

      {layerPanelVisible && (
        <LayerToggles
          showTrails={showTrails} showAvalanche={showAvalanche} showPOI={showPOI}
          showConditions={showConditions} showDifficulty={showDifficulty}
          snapToTrailEnabled={snapEnabled}
          onTrails={setShowTrails} onAvalanche={setShowAvalanche} onPOI={setShowPOI}
          onConditions={setShowConditions} onDifficulty={setShowDifficulty}
          onSnapToTrail={setSnapEnabled}
        />
      )}

      <TouchableOpacity style={styles.centerBtn} onPress={handleCenterOnMe}>
        <Text style={styles.centerBtnText}>◎</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.groupBtn, panelVisible && styles.groupBtnActive]}
        onPress={() => { setSelectedMember(null); setLayerPanelVisible(false); setConditionsPanelVisible(false); setPanelVisible((v) => !v); }}
      >
        <Text style={styles.groupBtnText}>Group</Text>
      </TouchableOpacity>

      {/* Conditions shortcut */}
      <TouchableOpacity
        style={[styles.conditionsBtn, conditionsPanelVisible && styles.conditionsBtnActive]}
        onPress={() => { setSelectedMember(null); setPanelVisible(false); setLayerPanelVisible(false); setConditionsPanelVisible((v) => !v); setRoutePanelVisible(false); }}
      >
        <Text style={styles.conditionsBtnText}>❄️</Text>
      </TouchableOpacity>

      {/* Routes shortcut */}
      <TouchableOpacity
        style={[styles.routesBtn, routePanelVisible && styles.routesBtnActive]}
        onPress={() => {
          setSelectedMember(null);
          setPanelVisible(false);
          setLayerPanelVisible(false);
          setConditionsPanelVisible(false);
          setRoutePanelVisible((v) => !v);
        }}
      >
        <Text style={styles.routesBtnText}>🗺</Text>
      </TouchableOpacity>

      <RouteSuggestionsPanel
        visible={routePanelVisible}
        suggestions={routeSuggestions}
        selectedIndex={selectedRouteIndex}
        onSelectRoute={(idx) => {
          setSelectedRouteIndex((prev) => (prev === idx ? null : idx));
        }}
        onClose={() => { setRoutePanelVisible(false); setSelectedRouteIndex(null); }}
      />

      {selectedMember && !panelVisible && (
        <MemberDetailSheet
          member={selectedMember}
          userCoords={userCoords}
          isFollowing={followUserId === selectedMember.userId}
          onClose={() => { setSelectedMember(null); setFollowUserId(null); }}
          onToggleFollow={() => {
            setFollowUserId((prev) =>
              prev === selectedMember.userId ? null : selectedMember.userId,
            );
          }}
        />
      )}

      <MemberListPanel
        visible={panelVisible}
        members={memberList}
        onClose={() => setPanelVisible(false)}
        onMemberPress={(member) => { setPanelVisible(false); setSelectedMember(member); }}
      />

      {/* Trail Conditions Panel */}
      <RecentConditionsPanel
        visible={conditionsPanelVisible}
        reports={conditionReports}
        onClose={() => setConditionsPanelVisible(false)}
        onReportCondition={() => {
          setConditionsPanelVisible(false);
          setConditionReportModalVisible(true);
        }}
      />

      {/* Trail Condition Report Modal */}
      <TrailConditionModal
        visible={conditionReportModalVisible}
        userLat={userCoords ? userCoords[1] : null}
        userLng={userCoords ? userCoords[0] : null}
        onClose={() => setConditionReportModalVisible(false)}
        onSubmitted={() => {
          if (userCoords) {
            const [lng, lat] = userCoords;
            fetchNearbyConditions(lat, lng).then(setConditionReports).catch(() => {});
          }
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------
const { width: _SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  map: { flex: 1 },
  reconnectBanner: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: 'rgba(255,170,0,0.92)', paddingVertical: 10, alignItems: 'center', zIndex: 20 },
  reconnectText: { color: '#000', fontWeight: '700', fontSize: 14 },
  hud: { position: 'absolute', top: 60, right: 12, backgroundColor: 'rgba(8,12,20,0.85)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 4 },
  hudText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  hudTextSm: { color: colors.textDim, fontSize: 11 },
  layerBtn: { position: 'absolute', top: 60, left: 12, backgroundColor: 'rgba(8,12,20,0.85)', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  layerBtnText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  layerPanel: { position: 'absolute', top: 110, left: 12, backgroundColor: 'rgba(13,21,32,0.96)', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', minWidth: 170, zIndex: 10 },
  layerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
  layerLabel: { color: colors.text, fontSize: 13, marginRight: 12 },
  centerBtn: { position: 'absolute', bottom: 100, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  centerBtnText: { fontSize: 22, color: colors.accent },
  groupBtn: { position: 'absolute', bottom: 160, right: 16, backgroundColor: colors.accent, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 24, elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  groupBtnActive: { backgroundColor: colors.textDim },
  groupBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  detailSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 20 },
  sheetHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  sheetName: { color: '#fff', fontSize: 20, fontWeight: '700' },
  sheetClose: { color: colors.textDim, fontSize: 20, padding: 4 },
  sheetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  sheetLabel: { color: colors.textDim, fontSize: 14 },
  sheetValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  followBtn: { marginTop: 16, borderWidth: 1.5, borderColor: colors.accent, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  followBtnActive: { backgroundColor: colors.accent + '22' },
  followBtnText: { color: colors.accent, fontSize: 15, fontWeight: '700' },
  followBtnTextActive: { color: colors.accent },
  conditionsBtn: { position: 'absolute', bottom: 220, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  conditionsBtnActive: { backgroundColor: colors.accent + '33', borderColor: colors.accent },
  conditionsBtnText: { fontSize: 22 },
  routesBtn: { position: 'absolute', bottom: 280, right: 16, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 4 },
  routesBtnActive: { backgroundColor: colors.accent + '33', borderColor: colors.accent },
  routesBtnText: { fontSize: 20 },
  routePanel: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 16, paddingBottom: 36, maxHeight: 320, shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.4, shadowRadius: 12, elevation: 20 },
  routePanelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  routePanelTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  routePanelClose: { color: colors.textDim, fontSize: 20, padding: 4 },
  routeEmpty: { color: colors.textDim, fontSize: 14, textAlign: 'center', marginTop: 8 },
  routeItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)' },
  routeItemSelected: { backgroundColor: 'rgba(0,170,255,0.12)', borderRadius: 8, paddingHorizontal: 8 },
  routeDot: { width: 12, height: 12, borderRadius: 6, marginRight: 12 },
  routeInfo: { flex: 1 },
  routeName: { color: colors.text, fontSize: 14, fontWeight: '600' },
  routeMeta: { color: colors.textDim, fontSize: 12, marginTop: 2 },
});
