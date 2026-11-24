import { haversine, pointAt, seededRandom, type LatLng } from "./geo";
import { classifySpeed, ZONE_LABEL, type SpeedLimits, type SpeedStatus, type ZoneType } from "./speed-rules";
import { locationLabel, nearestLandmark, resolveZone } from "./world";
import { NODES, edgeLabel, nearestNode } from "./network";
import { advanceTraveler, routeEdgeIndex, shortestPath, type NetRoute } from "./routing";
import {
  EXTERNAL_AI,
  geofenceStep,
  initialGeoState,
  insidePolygon,
  recordActivity,
  type GeoEventKind,
  type GeoState,
  type MonitoringSession,
} from "./geofence";

export type VehicleCategory = "Car" | "Two-wheeler" | "Bus" | "Truck" | "Auto-rickshaw";

export interface SimVehicle {
  id: string;
  plate: string;
  category: VehicleCategory;
  /** Name of the road the vehicle is currently on. */
  road: string;
  /** Current trip along the connected road network. */
  trip: NetRoute;
  /** Metres travelled along `trip`. */
  dist: number;
  /** Destination node of the current trip. */
  dest: number;
  /** Speed the driver wants to travel at (km/h). */
  cruise: number;
  /** Drivers flagged as speeders ignore zone limits. */
  speeder: boolean;
  /** Operator override from the speed-monitoring controls. */
  manualSpeed?: number | undefined;
  speed: number;
  overSeconds: number;
  status: SpeedStatus;
  zoneType: ZoneType;
  zoneId?: string | undefined;
  zoneName: string;
  limit: number;
  pos: LatLng;
  location: string;
  /** Coimbatore geofence state: local monitoring inside, external handoff outside. */
  geo: GeoState;
  /** Geofence crossing that happened on the latest tick (if any). */
  geoEvent?: GeoEventKind | undefined;
}

const LETTERS = "ABCDEFGHJKLMNPRSTUVWXYZ";
const RTO = ["37", "38", "66", "99", "37", "38"];

export function makePlate(rand: () => number): string {
  const l = () => LETTERS[Math.floor(rand() * LETTERS.length)];
  const num = String(1000 + Math.floor(rand() * 9000));
  return `TN ${RTO[Math.floor(rand() * RTO.length)]!} ${l()}${l()} ${num}`;
}

function pickCategory(r: number): VehicleCategory {
  if (r < 0.52) return "Car";
  if (r < 0.74) return "Two-wheeler";
  if (r < 0.83) return "Auto-rickshaw";
  if (r < 0.92) return "Truck";
  return "Bus";
}

const CRUISE: Record<VehicleCategory, [number, number]> = {
  Car: [38, 72],
  "Two-wheeler": [32, 62],
  "Auto-rickshaw": [25, 42],
  Truck: [35, 60],
  Bus: [30, 55],
};

/* ---------- Destinations across the whole network ---------- */

export const INSIDE_NODES: number[] = [];
export const OUTSIDE_NODES: number[] = [];
NODES.forEach((p, i) => (insidePolygon(p) ? INSIDE_NODES : OUTSIDE_NODES).push(i));

/** Share of trips that head out of the city (vehicles are free to leave the geofence). */
export const OUTSIDE_TRIP_SHARE = 0.3;

export function pickDestination(rand: () => number, from: number, outsideShare = OUTSIDE_TRIP_SHARE): number {
  for (let tries = 0; tries < 12; tries++) {
    const pool = rand() < outsideShare ? OUTSIDE_NODES : INSIDE_NODES;
    const n = pool[Math.floor(rand() * pool.length)]!;
    if (n !== from && haversine(NODES[n]!, NODES[from]!) > 1500) return n;
  }
  return (from + 1) % NODES.length;
}

/* ---------- Creation ---------- */

export interface SeedVehicle {
  plate: string;
  category: VehicleCategory;
  /** Start point (snapped to the nearest network junction). */
  from: LatLng;
  /** Trip destination (snapped to the nearest network junction). */
  to: LatLng;
  cruise: number;
  speeder: boolean;
}

function zoneText(zoneType: ZoneType, zoneName: string) {
  return zoneType === "urban" ? ZONE_LABEL.urban : zoneName;
}

/** Text for the zone column/popup: outside the city local zones are not enforced. */
export function vehicleZoneText(v: SimVehicle): string {
  return v.geo.mode === "external" ? "Outside Coimbatore" : zoneText(v.zoneType, v.zoneName);
}

export function monitoringText(v: SimVehicle): string {
  return v.geo.mode === "local" ? "Local · Coimbatore geofence" : `Handed off · ${EXTERNAL_AI}`;
}

function place(v: { trip: NetRoute; dist: number }, limits: SpeedLimits) {
  const pos = pointAt(v.trip.line, v.dist);
  const road = edgeLabel(v.trip.edges[routeEdgeIndex(v.trip, v.dist)] ?? 0);
  const zr = resolveZone(pos, limits);
  return { pos, road, zr, inside: insidePolygon(pos) };
}

export function createVehicles(count: number, seed: number, limits: SpeedLimits, featured: SeedVehicle[] = []): SimVehicle[] {
  const rand = seededRandom(seed);
  const out: SimVehicle[] = [];
  const make = (
    i: number,
    s: { plate: string; category: VehicleCategory; cruise: number; speeder: boolean },
    trip: NetRoute,
    dest: number,
    dist: number,
  ): SimVehicle => {
    const { pos, road, zr, inside } = place({ trip, dist }, limits);
    const external = !inside;
    const speed = s.speeder || external ? s.cruise : Math.min(s.cruise, zr.limit - 4);
    return {
      id: `v${i}`,
      plate: s.plate,
      category: s.category,
      road,
      trip,
      dist,
      dest,
      cruise: s.cruise,
      speeder: s.speeder,
      speed,
      overSeconds: 0,
      status: external ? "normal" : classifySpeed(speed, zr.limit, 0),
      zoneType: zr.type,
      zoneId: zr.zone?.id,
      zoneName: zr.zone?.name ?? "Urban Road",
      limit: zr.limit,
      pos,
      location: locationLabel(road, pos),
      geo: initialGeoState(inside),
    };
  };

  featured.forEach((f, i) => {
    const a = nearestNode(f.from);
    let b = nearestNode(f.to);
    if (b === a) b = pickDestination(rand, a);
    // Featured demo trips follow the direct road, ignoring congestion, so they pass their zones.
    const trip = shortestPath(a, b, { ignoreCongestion: true }) ?? shortestPath(a, pickDestination(rand, a))!;
    out.push(make(i, f, trip, trip.nodes[trip.nodes.length - 1]!, 0));
  });

  for (let i = featured.length; i < count; i++) {
    const category = pickCategory(rand());
    const [lo, hi] = CRUISE[category];
    const s = {
      plate: makePlate(rand),
      category,
      cruise: Math.round(lo + rand() * (hi - lo)),
      speeder: rand() < 0.22,
    };
    // Spawn anywhere on the network — inside and outside the city.
    let trip: NetRoute | null = null;
    let dest = 0;
    for (let tries = 0; tries < 8 && !trip; tries++) {
      const pool = rand() < 0.22 ? OUTSIDE_NODES : INSIDE_NODES;
      const origin = pool[Math.floor(rand() * pool.length)]!;
      dest = pickDestination(rand, origin);
      trip = shortestPath(origin, dest);
    }
    if (!trip) continue;
    out.push(make(i, s, trip, dest, rand() * 0.7 * trip.line.length));
  }
  return out;
}

/* ---------- Simulation step ---------- */

export interface StepOptions {
  dtSeconds: number;
  timeScale: number;
  limits: SpeedLimits;
  graceSeconds: number;
  rand?: () => number;
  now?: number;
}

/**
 * Advances every vehicle one tick: drive along its road-network trip (planning a new
 * trip on arrival), apply the Coimbatore geofence, then — only while locally monitored —
 * resolve the speed zone and compare speed to its limit.
 */
export function stepVehicles(vs: SimVehicle[], o: StepOptions): SimVehicle[] {
  const rand = o.rand ?? Math.random;
  const now = o.now ?? Date.now();
  return vs.map((v) => {
    const local = v.geo.mode === "local";
    const target =
      v.manualSpeed ?? (v.speeder || !local ? v.cruise : Math.min(v.cruise, Math.max(15, v.limit - 3)));
    const noise = (rand() - 0.5) * 3;
    let speed = v.speed + (target - v.speed) * 0.35 + noise;
    if (v.manualSpeed !== undefined) speed = v.manualSpeed + noise * 0.4;
    speed = Math.max(0, Math.round(speed));

    const meters = (speed / 3.6) * o.dtSeconds * o.timeScale;
    const t = advanceTraveler({ route: v.trip, dist: v.dist, dest: v.dest }, meters, (from) => pickDestination(rand, from));
    const { pos, road, zr, inside } = place({ trip: t.route, dist: t.dist }, o.limits);

    const g = geofenceStep(v.geo, inside, now);
    let geo = g.state;
    let status: SpeedStatus = "normal";
    let overSeconds = 0;
    if (geo.mode === "local") {
      const over = speed > zr.limit;
      overSeconds = over ? v.overSeconds + o.dtSeconds : 0;
      status = classifySpeed(speed, zr.limit, overSeconds, o.graceSeconds);
      if (geo.session) {
        const session = recordActivity(geo.session, { speed, status, prevStatus: g.event ? "normal" : v.status, zoneName: zr.zone?.name, ts: now });
        if (session !== geo.session) geo = { ...geo, session };
      }
    }
    return {
      ...v,
      trip: t.route,
      dist: t.dist,
      dest: t.dest,
      road,
      speed,
      pos,
      overSeconds,
      status,
      zoneType: zr.type,
      zoneId: zr.zone?.id,
      zoneName: zr.zone?.name ?? "Urban Road",
      limit: zr.limit,
      location: locationLabel(road, pos),
      geo,
      geoEvent: g.event ?? undefined,
    };
  });
}

/* ---------- Geofence events for the shared log ---------- */

export interface GeofenceEvent {
  plate: string;
  category: VehicleCategory;
  kind: GeoEventKind;
  road: string;
  place: string;
  speed: number;
  at: LatLng;
  priorSessions: number;
  /** Retained session handed to the external system on exit. */
  session?: MonitoringSession | undefined;
}

export function collectGeofenceEvents(vs: SimVehicle[]): GeofenceEvent[] {
  const out: GeofenceEvent[] = [];
  for (const v of vs) {
    if (!v.geoEvent) continue;
    out.push({
      plate: v.plate,
      category: v.category,
      kind: v.geoEvent,
      road: v.road,
      place: nearestLandmark(v.pos),
      speed: v.speed,
      at: v.pos,
      priorSessions: v.geo.retained.length - (v.geoEvent === "exit" ? 1 : 0),
      session: v.geoEvent === "exit" ? v.geo.retained[v.geo.retained.length - 1] : undefined,
    });
  }
  return out;
}
