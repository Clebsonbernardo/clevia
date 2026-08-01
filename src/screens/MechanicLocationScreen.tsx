import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import {
  MapPin, Clock, RefreshCw, AlertCircle,
  Footprints, Building2, Layers, Maximize2,
  Wrench, Factory, Boxes, Navigation,
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

type MechanicLocation = {
  id: string;
  user_id: string;
  mechanic_id: string | null;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  heading: number | null;
  speed: number | null;
  updated_at: string;
  display_name: string | null;
  mechanic_name: string | null;
};

type OfflineMechanic = {
  user_id: string;
  display_name: string;
};

type MapLayerKey = 'satellite' | 'terrain' | 'topo' | 'street';

const MAP_LAYERS: Record<MapLayerKey, { label: string; url: string; attribution: string; maxZoom: number }> = {
  satellite: {
    label: 'Satélite',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics',
    maxZoom: 19,
  },
  terrain: {
    label: 'Relevo',
    url: 'https://stamen-tiles.a.ssl.fastly.net/terrain/{z}/{x}/{y}.jpg',
    attribution: '&copy; Stamen Design, &copy; OpenStreetMap',
    maxZoom: 18,
  },
  topo: {
    label: 'Topográfico',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenTopoMap (CC-BY-SA)',
    maxZoom: 17,
  },
  street: {
    label: 'Ruas',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; OpenStreetMap',
    maxZoom: 19,
  },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'agora mesmo';
  if (mins === 1) return 'há 1 min';
  if (mins < 60) return `há ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours === 1) return 'há 1 hora';
  return `há ${hours} horas`;
}

function isMoving(speed: number | null): boolean {
  return speed != null && speed > 0.5;
}

function getInitials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
}

function createAvatarIcon(name: string, moving: boolean, stale: boolean, selected: boolean): L.DivIcon {
  const initials = getInitials(name);
  const color = stale
    ? 'bg-slate-600 border-slate-500 text-slate-300'
    : moving
    ? 'bg-gradient-to-br from-rose-500 to-orange-500 border-rose-300 text-white'
    : 'bg-gradient-to-br from-emerald-500 to-teal-500 border-emerald-300 text-white';
  const dot = stale ? 'bg-slate-500' : moving ? 'bg-orange-400' : 'bg-emerald-400';
  const ring = selected ? 'ring-4 ring-sky-400/70' : '';
  const pulse = moving ? 'animate-pulse' : '';

  return L.divIcon({
    className: 'mechanic-avatar',
    html: `
      <div class="relative flex flex-col items-center ${pulse}">
        <div class="relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-lg ${color} ${ring}">
          <span>${initials}</span>
          <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${dot}"></div>
        </div>
        <span class="mt-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-slate-900/90 text-slate-200 shadow-md">${name}</span>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 26],
  });
}

function createOfflineIcon(name: string, selected: boolean): L.DivIcon {
  const initials = getInitials(name);
  const ring = selected ? 'ring-4 ring-sky-400/70' : '';
  return L.divIcon({
    className: 'mechanic-avatar',
    html: `
      <div class="relative flex flex-col items-center">
        <div class="relative w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold border-2 shadow-lg bg-gradient-to-br from-amber-400 to-orange-500 border-amber-300 text-slate-950 ${ring}">
          <span>${initials}</span>
          <div class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 bg-emerald-400"></div>
        </div>
        <span class="mt-1 px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap bg-slate-900/90 text-slate-200 shadow-md">${name}</span>
      </div>
    `,
    iconSize: [40, 52],
    iconAnchor: [20, 26],
  });
}

function createAccuracyCircle(loc: MechanicLocation): L.Circle | null {
  if (loc.accuracy_meters == null || loc.accuracy_meters <= 0) return null;
  return L.circle([loc.latitude, loc.longitude], {
    radius: loc.accuracy_meters,
    color: '#f43f5e',
    fillColor: '#f43f5e',
    fillOpacity: 0.08,
    weight: 1,
  });
}

export default function MechanicLocationScreen() {
  const { activeCompany } = useAuth();
  const [locations, setLocations] = useState<MechanicLocation[]>([]);
  const [offlineMechanics, setOfflineMechanics] = useState<OfflineMechanic[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [mapLayer, setMapLayer] = useState<MapLayerKey>('satellite');
  const [showLayerMenu, setShowLayerMenu] = useState(false);

  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());
  const accuracyRef = useRef<Map<string, L.Circle>>(new Map());
  const firstFitRef = useRef(true);

  const loadLocations = useCallback(async (manual = false) => {
    if (!activeCompany) return;
    if (manual) setRefreshing(true);

    const [locRes, membersRes] = await Promise.all([
      supabase
        .from('mechanic_locations')
        .select(`
          id, user_id, mechanic_id, latitude, longitude, accuracy_meters,
          heading, speed, updated_at,
          mechanics(name)
        `)
        .eq('company_id', activeCompany.id),
      supabase
        .from('company_members')
        .select('user_id, display_name, role')
        .eq('company_id', activeCompany.id)
        .in('role', ['mecanico', 'mechanic']),
    ]);

    if (locRes.error) {
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const nameMap = new Map<string, string>();
    for (const cm of membersRes.data ?? []) {
      if (cm.display_name) nameMap.set(cm.user_id, cm.display_name);
    }

    const mapped: MechanicLocation[] = (locRes.data ?? []).map((row: any) => ({
      id: row.id,
      user_id: row.user_id,
      mechanic_id: row.mechanic_id,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracy_meters: row.accuracy_meters,
      heading: row.heading,
      speed: row.speed,
      updated_at: row.updated_at,
      display_name: nameMap.get(row.user_id) ?? null,
      mechanic_name: row.mechanics?.name ?? null,
    }));

    setLocations(mapped);

    const trackedUserIds = new Set(mapped.map((l) => l.user_id));
    const offline: OfflineMechanic[] = (membersRes.data ?? [])
      .filter((cm: any) => !trackedUserIds.has(cm.user_id) && cm.display_name)
      .map((cm: any) => ({ user_id: cm.user_id, display_name: cm.display_name }));
    setOfflineMechanics(offline);

    setLoading(false);
    setRefreshing(false);
  }, [activeCompany]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-23.5, -46.6],
      zoom: 15,
      zoomControl: true,
      attributionControl: true,
    });

    const layerCfg = MAP_LAYERS[mapLayer];
    const tileLayer = L.tileLayer(layerCfg.url, {
      attribution: layerCfg.attribution,
      maxZoom: layerCfg.maxZoom,
    }).addTo(map);
    tileLayerRef.current = tileLayer;
    mapRef.current = map;

    // Fix tile rendering after container resize
    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapRef.current = null;
      tileLayerRef.current = null;
      markersRef.current.clear();
      accuracyRef.current.clear();
    };
  }, []);

  // Recalculate map size when loading finishes
  useEffect(() => {
    if (!loading && mapRef.current) {
      setTimeout(() => mapRef.current?.invalidateSize(), 100);
    }
  }, [loading]);

  // Switch tile layer
  useEffect(() => {
    if (!mapRef.current) return;
    if (tileLayerRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
    }
    const layerCfg = MAP_LAYERS[mapLayer];
    const tileLayer = L.tileLayer(layerCfg.url, {
      attribution: layerCfg.attribution,
      maxZoom: layerCfg.maxZoom,
    }).addTo(mapRef.current);
    tileLayerRef.current = tileLayer;
  }, [mapLayer]);

  // Update markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const validIds = new Set<string>();

    // Tracked mechanics
    for (const loc of locations) {
      const id = loc.user_id;
      validIds.add(id);
      const name = loc.display_name ?? loc.mechanic_name ?? 'Mecânico';
      const moving = isMoving(loc.speed);
      const isSelected = selected === id;
      const icon = createAvatarIcon(name, moving, false, isSelected);

      const existing = markersRef.current.get(id);
      if (existing) {
        existing.setLatLng([loc.latitude, loc.longitude]);
        existing.setIcon(icon);
      } else {
        const marker = L.marker([loc.latitude, loc.longitude], { icon }).addTo(map);
        marker.on('click', () => setSelected(id));
        markersRef.current.set(id, marker);
      }

      // Accuracy circle
      const oldCircle = accuracyRef.current.get(id);
      if (oldCircle) {
        map.removeLayer(oldCircle);
        accuracyRef.current.delete(id);
      }
      const circle = createAccuracyCircle(loc);
      if (circle) {
        circle.addTo(map);
        accuracyRef.current.set(id, circle);
      }
    }

    // Remove stale markers
    for (const [id, marker] of markersRef.current) {
      if (!validIds.has(id) && !offlineMechanics.some((m) => m.user_id === id)) {
        map.removeLayer(marker);
        markersRef.current.delete(id);
        const circle = accuracyRef.current.get(id);
        if (circle) {
          map.removeLayer(circle);
          accuracyRef.current.delete(id);
        }
      }
    }

    // Fit bounds on first load
    if (firstFitRef.current && locations.length > 0) {
      const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude] as [number, number]));
      map.fitBounds(bounds, { padding: [50, 50] });
      firstFitRef.current = false;
    }
  }, [locations, selected, offlineMechanics]);

  // Realtime subscription
  useEffect(() => {
    loadLocations();
    if (!activeCompany) return;

    const channel = supabase
      .channel('mechanic-locations-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'mechanic_locations', filter: `company_id=eq.${activeCompany.id}` },
        () => loadLocations(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeCompany]);

  useEffect(() => {
    const interval = setInterval(() => loadLocations(), 15_000);
    return () => clearInterval(interval);
  }, [loadLocations]);

  const handleRefresh = () => loadLocations(true);

  const fitAll = () => {
    if (!mapRef.current || locations.length === 0) return;
    const bounds = L.latLngBounds(locations.map((l) => [l.latitude, l.longitude] as [number, number]));
    mapRef.current.fitBounds(bounds, { padding: [50, 50] });
  };

  const focusMechanic = (userId: string) => {
    setSelected(userId);
    const loc = locations.find((l) => l.user_id === userId);
    if (loc && mapRef.current) {
      mapRef.current.flyTo([loc.latitude, loc.longitude], 18, { duration: 0.8 });
    }
  };

  const activeMechanics = locations;
  const movingCount = activeMechanics.filter((l) => isMoving(l.speed)).length;
  const totalMechanics = activeMechanics.length + offlineMechanics.length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-rose-400" />
            Localização em Tempo Real
          </h2>
          <p className="text-sm text-slate-400 mt-1">
            {totalMechanics} mecânico(s) · {activeMechanics.length + offlineMechanics.length} ativo(s) · {movingCount} movendo
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white active:scale-95 transition text-sm disabled:opacity-60"
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          {refreshing ? 'Atualizando...' : 'Atualizar'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Real map */}
          <div className="lg:col-span-2 bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
              <Navigation className="w-4 h-4 text-sky-400" />
              <span className="text-sm font-semibold text-slate-300">Mapa de Relevo — Satélite</span>
              <span className="ml-auto text-xs text-slate-500">Tempo real</span>
            </div>
            <div className="relative w-full" style={{ height: '500px' }}>
              <div ref={containerRef} className="absolute inset-0" style={{ background: '#1e293b' }} />
              {loading && (
                <div className="absolute inset-0 z-[1001] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
                  <RefreshCw className="w-6 h-6 text-sky-400 animate-spin" />
                </div>
              )}

              {/* Layer switcher */}
              <div className="absolute top-3 right-3 z-[1000]">
                <div className="relative">
                  <button
                    onClick={() => setShowLayerMenu(!showLayerMenu)}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 backdrop-blur border border-slate-700 text-slate-200 hover:bg-slate-800 transition text-sm shadow-lg"
                  >
                    <Layers className="w-4 h-4 text-sky-400" />
                    {MAP_LAYERS[mapLayer].label}
                  </button>
                  {showLayerMenu && (
                    <div className="absolute top-full right-0 mt-1 bg-slate-900/95 backdrop-blur rounded-lg border border-slate-700 shadow-xl overflow-hidden min-w-[140px]">
                      {(Object.keys(MAP_LAYERS) as MapLayerKey[]).map((key) => (
                        <button
                          key={key}
                          onClick={() => { setMapLayer(key); setShowLayerMenu(false); }}
                          className={`w-full text-left px-3 py-2 text-sm transition flex items-center gap-2 ${
                            mapLayer === key
                              ? 'bg-sky-500/20 text-sky-300'
                              : 'text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <div className={`w-3 h-3 rounded ${mapLayer === key ? 'bg-sky-400' : 'bg-slate-600'}`} />
                          {MAP_LAYERS[key].label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Fit all button */}
              <button
                onClick={fitAll}
                className="absolute bottom-3 right-3 z-[1000] flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/90 backdrop-blur border border-slate-700 text-slate-200 hover:bg-slate-800 transition text-sm shadow-lg"
              >
                <Maximize2 className="w-4 h-4 text-sky-400" />
                Ver todos
              </button>

              {/* Legend */}
              <div className="absolute bottom-3 left-3 z-[1000] flex items-center gap-3 bg-slate-900/90 backdrop-blur rounded-lg px-3 py-2 border border-slate-800 shadow-lg">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                  <span className="text-[10px] text-slate-400">Parado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-orange-400" />
                  <span className="text-[10px] text-slate-400">Movendo</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="text-[10px] text-slate-400">Disponível</span>
                </div>
              </div>
            </div>
          </div>

          {/* Mechanic list */}
          <div className="space-y-2">
            {activeMechanics.length > 0 && (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 px-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Ativos Agora ({activeMechanics.length})
                </div>
                {activeMechanics.map((loc) => (
                  <MechanicCard key={loc.id} loc={loc} selected={selected === loc.user_id} onClick={() => focusMechanic(loc.user_id)} />
                ))}
              </>
            )}

            {offlineMechanics.length > 0 && (
              <>
                <div className="flex items-center gap-2 text-sm font-semibold text-emerald-400 px-1 pt-3">
                  <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Disponíveis na Empresa ({offlineMechanics.length})
                </div>
                {offlineMechanics.map((m) => (
                  <OfflineCard key={m.user_id} name={m.display_name} selected={selected === m.user_id} onClick={() => setSelected(m.user_id)} />
                ))}
              </>
            )}
          </div>
        </div>
    </div>
  );
}

function MechanicCard({ loc, selected, onClick }: {
  loc: MechanicLocation;
  selected: boolean;
  onClick: () => void;
}) {
  const moving = isMoving(loc.speed);
  const name = loc.display_name ?? loc.mechanic_name ?? 'Mecânico';
  const initials = getInitials(name);

  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        selected
          ? 'bg-sky-500/10 border-sky-500/50'
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className={`relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold ${
          moving
            ? 'bg-gradient-to-br from-rose-500 to-orange-500 text-white'
            : 'bg-gradient-to-br from-emerald-500 to-teal-500 text-white'
        }`}>
          {initials}
          <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
            moving ? 'bg-orange-400' : 'bg-emerald-400'
          }`} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-200 truncate">{name}</p>
          <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
            <span className="flex items-center gap-1 text-emerald-400">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {timeAgo(loc.updated_at)}
            </span>
            {loc.accuracy_meters && (
              <span className="text-slate-500">±{Math.round(loc.accuracy_meters)}m</span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          {moving ? (
            <p className="text-xs text-orange-400 mt-0.5 flex items-center gap-1 justify-end">
              <Footprints className="w-3 h-3 animate-bounce" style={{ animationDuration: '0.6s' }} />
              {(loc.speed! * 3.6).toFixed(1)} km/h
            </p>
          ) : (
            <p className="text-xs text-emerald-400 flex items-center gap-1 justify-end">
              <MapPin className="w-3 h-3" /> Parado
            </p>
          )}
        </div>
      </div>
    </button>
  );
}

function OfflineCard({ name, selected, onClick }: {
  name: string;
  selected: boolean;
  onClick: () => void;
}) {
  const initials = getInitials(name);
  return (
    <button
      onClick={onClick}
      className={`w-full text-left p-3 rounded-xl border transition-all ${
        selected
          ? 'bg-sky-500/10 border-sky-500/50'
          : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-bold bg-gradient-to-br from-amber-400 to-orange-500 text-slate-950">
          {initials}
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 bg-emerald-400 animate-pulse" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-200 truncate">{name}</p>
          <div className="flex items-center gap-1 text-xs text-emerald-400 mt-0.5">
            <MapPin className="w-3 h-3" /> Disponível na empresa
          </div>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xs text-emerald-400 flex items-center gap-1 justify-end">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Ativo
          </p>
        </div>
      </div>
    </button>
  );
}
