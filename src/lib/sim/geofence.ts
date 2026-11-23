/**
 * Coimbatore operational geofence. Vehicles are never confined by it: it only
 * decides whether Sentinel Road monitors a vehicle locally (inside) or hands its
 * tracking to an external system (outside, simulated). Crossing history is kept.
 */
import type { LatLng } from "./geo";
import type { SpeedStatus } from "./speed-rules";

export const GEOFENCE_NAME = "Coimbatore operational geofence";
export const EXTERNAL_AI = "Regional Highway AI (simulated)";

/** Approximate Coimbatore city-corporation limits, clockwise from Vadavalli. [lat, lng] */
export const CBE_GEOFENCE: LatLng[] = [
  [11.03, 76.895],
  [11.055, 76.915],
  [11.08, 76.94],
  [11.087, 76.975],
  [11.082, 77.005],
  [11.068, 77.04],
  [11.042, 77.066],
  [11.005, 77.062],
  [10.983, 77.05],
  [10.952, 77.008],
  [10.93, 76.975],
  [10.953, 76.935],
  [10.978, 76.913],
  [11.005, 76.902],
];

/** Ray-casting point-in-polygon test (lng as x, lat as y). */
export function insidePolygon(p: LatLng, poly: LatLng[] = CBE_GEOFENCE): boolean {
  const [y, x] = p;
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i]!;
    const [yj, xj] = poly[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export type MonitoringMode = "local" | "external";
export type GeoEventKind = "entry" | "reentry" | "exit";

export interface MonitoringSession {
  startedAt: number;
  endedAt?: number | undefined;
  maxSpeed: number;
  warnings: number;
  violations: number;
  zones: string[];
}

export interface GeoState {
  inside: boolean;
  mode: MonitoringMode;
  entries: number;
  exits: number;
  handoffs: number;
  /** Current local monitoring session (null while outside). */
  session: MonitoringSession | null;
  /** Completed local sessions, retained after the vehicle leaves the city. */
  retained: MonitoringSession[];
  lastEventTs?: number | undefined;
}

const newSession = (ts: number): MonitoringSession => ({ startedAt: ts, maxSpeed: 0, warnings: 0, violations: 0, zones: [] });

export function initialGeoState(inside: boolean, ts = 0): GeoState {
  return { inside, mode: inside ? "local" : "external", entries: 0, exits: 0, handoffs: 0, session: inside ? newSession(ts) : null, retained: [] };
}

/**
 * Applies a geofence observation. Entering activates local monitoring (a fresh session);
 * leaving deactivates it, retains the finished session and counts a handoff to the
 * external system. Re-entering after any exit is reported as `reentry`.
 */
export function geofenceStep(prev: GeoState, insideNow: boolean, ts: number): { state: GeoState; event: GeoEventKind | null } {
  if (prev.inside === insideNow) return { state: prev, event: null };
  if (insideNow) {
    const event: GeoEventKind = prev.exits > 0 || prev.retained.length > 0 ? "reentry" : "entry";
    return {
      state: { ...prev, inside: true, mode: "local", entries: prev.entries + 1, session: newSession(ts), lastEventTs: ts },
      event,
    };
  }
  const ended = prev.session ? { ...prev.session, endedAt: ts } : null;
  return {
    state: {
      ...prev,
      inside: false,
      mode: "external",
      exits: prev.exits + 1,
      handoffs: prev.handoffs + 1,
      session: null,
      retained: ended ? [...prev.retained, ended].slice(-10) : prev.retained,
      lastEventTs: ts,
    },
    event: "exit",
  };
}

/** Updates the local session's history with this tick's observation. */
export function recordActivity(
  s: MonitoringSession,
  a: { speed: number; status: SpeedStatus; prevStatus: SpeedStatus; zoneName?: string | undefined; ts: number },
): MonitoringSession {
  const warnings = s.warnings + (a.status === "warning" && a.prevStatus === "normal" ? 1 : 0);
  const violations = s.violations + (a.status === "violation" && a.prevStatus !== "violation" ? 1 : 0);
  const zones = a.zoneName && !s.zones.includes(a.zoneName) ? [...s.zones, a.zoneName] : s.zones;
  const startedAt = s.startedAt || a.ts;
  if (warnings === s.warnings && violations === s.violations && zones === s.zones && a.speed <= s.maxSpeed && startedAt === s.startedAt) return s;
  return { ...s, startedAt, maxSpeed: Math.max(s.maxSpeed, a.speed), warnings, violations, zones };
}
