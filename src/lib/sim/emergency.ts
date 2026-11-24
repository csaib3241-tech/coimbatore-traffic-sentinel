/**
 * Emergency intelligence planning on the connected road network. Every route is
 * computed deterministically (Dijkstra + penalty alternatives); explanations are
 * generated from the computed metrics only — nothing here invents a route.
 * All communications, incidents and signal coordination are simulated.
 */
import { pointAt, type LatLng } from "./geo";
import { ADJ, EDGES, NODES, SIGNAL_NODES, edgeDistance, edgeLabel, edgesNear, nearestEdge, nearestNode } from "./network";
import {
  EDGE_CONGESTION,
  buildRoute,
  edgeTravelSec,
  nodeDist,
  routeEdgeIndex,
  shortestPath,
  type NetRoute,
} from "./routing";
import { HOSPITALS, nearestLandmark, type Hospital } from "./world";
import { insidePolygon } from "./geofence";

/* ---------- Inbox messages ---------- */

export type Severity = "Critical" | "High" | "Medium";
export type MessageStatus = "new" | "accepted" | "dispatched" | "resolved" | "dismissed";

export interface EmergencyMessage {
  id: string;
  type: string;
  severity: Severity;
  source: string;
  location: string;
  at: LatLng;
  receivedAt: number;
  summary: string;
  status: MessageStatus;
  demo?: boolean;
}

export interface MessageTemplate {
  type: string;
  severity: Severity;
  source: string;
  at: LatLng;
  summary: string;
}

export const MESSAGE_TEMPLATES: MessageTemplate[] = [
  { type: "Cardiac emergency", severity: "Critical", source: "108 ambulance line (simulated)", at: [11.0262, 76.9505], summary: "Caller reports 58-year-old male collapsed, unresponsive." },
  { type: "Two-wheeler collision", severity: "High", source: "CCTV analytics · CAM-03 (simulated)", at: [10.9895, 76.9618], summary: "Camera detected a fallen rider near the bus terminus; traffic stopped." },
  { type: "Pedestrian injury", severity: "Medium", source: "Patrol PCR 07 radio (simulated)", at: [11.0425, 76.9805], summary: "Pedestrian struck at low speed, conscious, leg injury." },
  { type: "Multi-vehicle collision", severity: "Critical", source: "Highway patrol radio (simulated)", at: [11.058, 77.0845], summary: "Three vehicles involved on the bypass; two injured, one trapped." },
  { type: "Bus passenger medical", severity: "High", source: "Connected bus panic button (simulated)", at: [10.9978, 77.0255], summary: "Driver pressed the medical alert; passenger having breathing difficulty." },
  { type: "Fall injury", severity: "Medium", source: "112 emergency call (simulated)", at: [10.9625, 76.9682], summary: "Construction worker fell from scaffolding, conscious." },
];

/** The one-click demonstration incident. */
export const DEMO_TEMPLATE: MessageTemplate = {
  type: "Road traffic collision",
  severity: "Critical",
  source: "112 emergency call + CCTV CAM-07 (simulated)",
  at: [11.0105, 76.9815],
  summary: "Car and two-wheeler collision at Lakshmi Mills junction; rider unconscious.",
};

/** Name of the closest named road (within 150 m), else the closest road's class. */
export function roadNameAt(p: LatLng): string {
  const named = edgesNear(p, 150).filter((e) => EDGES[e]!.name);
  if (named.length) return EDGES[named.reduce((b, e) => (edgeDistance(e, p) < edgeDistance(b, p) ? e : b))]!.name;
  return edgeLabel(nearestEdge(p));
}

export function describeLocation(p: LatLng): string {
  return `${roadNameAt(p)}, near ${nearestLandmark(p)}${insidePolygon(p) ? "" : " (outside city)"}`;
}

export function createMessage(t: MessageTemplate, seq: number, ts: number, demo = false): EmergencyMessage {
  return {
    id: `EIM-${String(4100 + seq).padStart(5, "0")}`,
    type: t.type,
    severity: t.severity,
    source: t.source,
    location: describeLocation(t.at),
    at: t.at,
    receivedAt: ts,
    summary: t.summary,
    status: "new",
    demo,
  };
}

/* ---------- Fleet ---------- */

export type UnitKind = "ambulance" | "fire" | "police";

export interface FleetUnit {
  id: string;
  kind: UnitKind;
  label: string;
  station: string;
  home: LatLng;
  available: boolean;
}

export const EMERGENCY_FLEET: FleetUnit[] = [
  { id: "AMB 001", kind: "ambulance", label: "Advanced life support", station: "CMCH depot", home: [10.9964, 76.9705], available: true },
  { id: "AMB 006", kind: "ambulance", label: "Advanced life support", station: "KMCH bay", home: [11.0418, 77.0397], available: true },
  { id: "AMB 011", kind: "ambulance", label: "Basic life support", station: "Saibaba Colony post", home: [11.026, 76.95], available: true },
  { id: "AMB 014", kind: "ambulance", label: "Basic life support", station: "Town Hall post", home: [10.9935, 76.9627], available: false },
  { id: "AMB 019", kind: "ambulance", label: "Advanced life support", station: "Saravanampatti post", home: [11.078, 76.998], available: true },
];

export interface UnitCandidate {
  unit: FleetUnit;
  node: number;
  route: NetRoute | null;
  timeSec: number;
  distance: number;
}

const routeTime = (r: NetRoute | null) => (r ? r.edges.reduce((a, e) => a + edgeTravelSec(e, "emergency"), 0) : 0);

/** Available ambulances ranked by computed road travel time to the incident. */
export function rankUnits(incidentNode: number, blocked: ReadonlySet<number>, fleet: FleetUnit[] = EMERGENCY_FLEET): UnitCandidate[] {
  return fleet
    .filter((u) => u.kind === "ambulance" && u.available)
    .map((unit) => {
      const node = nearestNode(unit.home);
      const route = shortestPath(node, incidentNode, { mode: "emergency", blocked });
      return { unit, node, route, timeSec: routeTime(route), distance: route?.line.length ?? 0 };
    })
    .filter((c) => c.route !== null || c.node === incidentNode)
    .sort((a, b) => a.timeSec - b.timeSec);
}

export interface HospitalOption {
  hospital: Hospital;
  node: number;
  timeSec: number;
  distance: number;
}

export function rankHospitals(incidentNode: number, blocked: ReadonlySet<number>): HospitalOption[] {
  return HOSPITALS.map((hospital) => {
    const node = nearestNode(hospital.at);
    const r = shortestPath(incidentNode, node, { mode: "emergency", blocked });
    return { hospital, node, timeSec: routeTime(r), distance: r?.line.length ?? Infinity };
  })
    .filter((h) => Number.isFinite(h.distance))
    .sort((a, b) => a.timeSec - b.timeSec);
}

/* ---------- Route alternatives & comparison ---------- */

export interface RouteSignal {
  node: number;
  dist: number;
  name: string;
  source: "osm" | "junction";
}

export interface RouteOption {
  id: string;
  route: NetRoute;
  distance: number;
  /** Travel time (s) for an emergency vehicle incl. residual junction delay. */
  timeSec: number;
  /** Length-weighted average congestion factor (1 = free flow). */
  congestion: number;
  /** Share of the route on heavily congested roads. */
  heavyShare: number;
  /** Route edges that are currently blocked. */
  blockedEdges: number;
  signals: RouteSignal[];
  via: string[];
}

export const JUNCTION_DELAY_SEC = 6;

function junctionName(node: number, routeEdges: Set<number>): string {
  const names = new Set<string>();
  for (const { edge } of ADJ[node]!) if (!routeEdges.has(edge) && EDGES[edge]!.name) names.add(EDGES[edge]!.name);
  const own = [...routeEdges].find((e) => (EDGES[e]!.a === node || EDGES[e]!.b === node) && EDGES[e]!.name);
  const cross = [...names].find((n) => n !== (own !== undefined ? EDGES[own]!.name : ""));
  const base = own !== undefined ? EDGES[own]!.name : nearestLandmark(NODES[node]!);
  return cross ? `${base} × ${cross}` : `${base} · near ${nearestLandmark(NODES[node]!)}`;
}

/** Signalised junctions on the route (OSM traffic signals; major junctions as fallback). */
export function routeSignals(route: NetRoute): RouteSignal[] {
  const set = new Set(route.edges);
  const out: RouteSignal[] = [];
  route.nodes.forEach((n, k) => {
    if (k === 0 || k === route.nodes.length - 1) return;
    if (SIGNAL_NODES.has(n)) out.push({ node: n, dist: nodeDist(route, k), name: junctionName(n, set), source: "osm" });
  });
  if (out.length < 3) {
    route.nodes.forEach((n, k) => {
      if (k === 0 || k === route.nodes.length - 1 || SIGNAL_NODES.has(n)) return;
      const major = ADJ[n]!.filter(({ edge }) => EDGES[edge]!.cls <= 2).length >= 3;
      const d = nodeDist(route, k);
      if (major && out.every((s) => Math.abs(s.dist - d) > 500)) out.push({ node: n, dist: d, name: junctionName(n, set), source: "junction" });
    });
  }
  return out.sort((a, b) => a.dist - b.dist).slice(0, 8);
}

export function evaluateRoute(id: string, route: NetRoute, blocked: ReadonlySet<number>): RouteOption {
  let weighted = 0;
  let heavy = 0;
  let time = 0;
  const byName = new Map<string, number>();
  for (const e of route.edges) {
    const len = EDGES[e]!.length;
    const c = EDGE_CONGESTION[e]!;
    weighted += len * c;
    if (c >= 2) heavy += len;
    time += edgeTravelSec(e, "emergency");
    const nm = EDGES[e]!.name;
    if (nm) byName.set(nm, (byName.get(nm) ?? 0) + len);
  }
  const signals = routeSignals(route);
  const total = Math.max(1, route.line.length);
  return {
    id,
    route,
    distance: route.line.length,
    timeSec: time + signals.length * JUNCTION_DELAY_SEC,
    congestion: weighted / total,
    heavyShare: heavy / total,
    blockedEdges: route.edges.filter((e) => blocked.has(e)).length,
    signals,
    via: byName.size ? [...byName.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n]) => n) : ["City streets"],
  };
}

/** Edges running alongside the route (incl. the opposite carriageway). */
function corridorEdges(route: NetRoute): Set<number> {
  const out = new Set<number>(route.edges);
  for (let d = 0; d <= route.line.length; d += 90) edgesNear(pointAt(route.line, d), 35).forEach((e) => out.add(e));
  return out;
}

/** Up to `k` genuinely different routes, computed with the penalty method on the real network. */
export function routeOptions(from: number, to: number, blocked: ReadonlySet<number>, k = 3): RouteOption[] {
  const routes: NetRoute[] = [];
  const corridors: Set<number>[] = [];
  const penalty = new Map<number, number>();
  for (let i = 0; i < 7 && routes.length < k; i++) {
    const r = shortestPath(from, to, { mode: "emergency", blocked, penalty });
    if (!r) break;
    const len = r.line.length || 1;
    const overlap = Math.max(0, ...corridors.map((c) => r.edges.reduce((a, e) => a + (c.has(e) ? EDGES[e]!.length : 0), 0) / len));
    const corridor = corridorEdges(r);
    if (overlap < 0.7) {
      routes.push(r);
      corridors.push(corridor);
    }
    corridor.forEach((e) => penalty.set(e, (penalty.get(e) ?? 1) * 1.7));
  }
  return routes
    .map((r) => evaluateRoute("", r, blocked))
    .sort((a, b) => a.timeSec - b.timeSec)
    .map((o, i) => ({ ...o, id: String.fromCharCode(65 + i) }));
}

const min = (s: number) => `${(s / 60).toFixed(1)} min`;
const km = (m: number) => `${(m / 1000).toFixed(1)} km`;

/** Picks the fastest unblocked option and explains the choice using only computed metrics. */
export function recommendRoute(options: RouteOption[]): { index: number; rationale: string[] } {
  const ok = options.map((o, i) => ({ o, i })).filter(({ o }) => o.blockedEdges === 0);
  if (!ok.length) return { index: -1, rationale: ["Every computed route crosses a blocked road — no safe recommendation."] };
  const best = ok.reduce((a, b) => (b.o.timeSec < a.o.timeSec ? b : a));
  const others = options.filter((_, i) => i !== best.i);
  const why: string[] = [];
  why.push(
    others.length
      ? `Route ${best.o.id} is the fastest unblocked option at ${min(best.o.timeSec)} (${others.map((o) => `${o.id}: ${min(o.timeSec)}`).join(", ")}).`
      : `Route ${best.o.id} is the only connected route (${min(best.o.timeSec)}).`,
  );
  const shorter = others.find((o) => o.distance < best.o.distance - 100 && o.blockedEdges === 0);
  if (shorter) why.push(`Route ${shorter.id} is shorter (${km(shorter.distance)} vs ${km(best.o.distance)}) but slower because of ${shorter.heavyShare > best.o.heavyShare ? "heavier congestion" : "slower roads"}.`);
  const heavier = others.filter((o) => o.heavyShare > best.o.heavyShare + 0.05);
  if (heavier.length) why.push(`It avoids heavy congestion: ${Math.round(best.o.heavyShare * 100)}% of the route is congested vs ${heavier.map((o) => `${Math.round(o.heavyShare * 100)}% on ${o.id}`).join(", ")}.`);
  const blockedOthers = others.filter((o) => o.blockedEdges > 0);
  if (blockedOthers.length) why.push(`Route${blockedOthers.length > 1 ? "s" : ""} ${blockedOthers.map((o) => o.id).join(", ")} cross${blockedOthers.length > 1 ? "" : "es"} a blocked road.`);
  why.push(`Main roads: ${best.o.via.join(" → ")} · ${best.o.signals.length} signalised junctions for priority.`);
  return { index: best.i, rationale: why };
}

/* ---------- Blockages & rerouting ---------- */

export interface Blockage {
  at: LatLng;
  edges: number[];
  label: string;
}

/** Simulated road closure on the first suitable segment at least `minAhead` metres ahead. */
export function pickBlockage(route: NetRoute, dist: number, to: number, minAhead = 700): Blockage | null {
  const startK = routeEdgeIndex(route, dist + minAhead);
  for (let k = startK; k < route.edges.length - 1; k++) {
    const id = route.edges[k]!;
    const e = EDGES[id]!;
    if (e.length < 120) continue;
    const edges = [...new Set([id, ...edgesNear(e.mid, 30)])];
    const set = new Set(edges);
    if (!shortestPath(route.nodes[k]!, to, { mode: "emergency", blocked: set })) continue;
    return { at: e.mid, edges, label: `${edgeLabel(id)}, near ${nearestLandmark(e.mid)}` };
  }
  return null;
}

/** True when a blocked edge lies on the remaining part of the route. */
export function blockedAhead(route: NetRoute, dist: number, blocked: ReadonlySet<number>): boolean {
  const k = routeEdgeIndex(route, dist);
  return route.edges.slice(k + 1).some((e) => blocked.has(e));
}

/**
 * Reroutes from the end of the current edge to `to`, avoiding blocked edges. The new
 * route starts with the current edge so the vehicle keeps its position (`dist`).
 */
export function rerouteFrom(
  route: NetRoute,
  dist: number,
  to: number,
  blocked: ReadonlySet<number>,
): { route: NetRoute; dist: number; options: RouteOption[]; recommended: number; rationale: string[] } | null {
  const k = routeEdgeIndex(route, dist);
  const next = route.nodes[k + 1]!;
  const offset = dist - nodeDist(route, k);
  const options = next === to ? [] : routeOptions(next, to, blocked);
  if (next !== to && !options.length) return null;
  const rec = options.length ? recommendRoute(options) : { index: -1, rationale: [] as string[] };
  const tail = rec.index >= 0 ? options[rec.index]!.route : null;
  const nodes = [route.nodes[k]!, next, ...(tail ? tail.nodes.slice(1) : [])];
  const edges = [route.edges[k]!, ...(tail ? tail.edges : [])];
  return { route: buildRoute(nodes, edges), dist: offset, options, recommended: rec.index, rationale: rec.rationale };
}

/* ---------- Mission plan ---------- */

export interface MissionPlan {
  incidentNode: number;
  units: UnitCandidate[];
  unitId: string | null;
  hospitals: HospitalOption[];
  hospitalId: Hospital["id"] | null;
  options: RouteOption[];
  recommended: number;
  rationale: string[];
}

export function planMission(
  at: LatLng,
  blocked: ReadonlySet<number>,
  choose: { unitId?: string | undefined; hospitalId?: Hospital["id"] | undefined } = {},
): MissionPlan {
  const incidentNode = nearestNode(at);
  const units = rankUnits(incidentNode, blocked);
  const unitId = (choose.unitId && units.some((u) => u.unit.id === choose.unitId) ? choose.unitId : units[0]?.unit.id) ?? null;
  const hospitals = rankHospitals(incidentNode, blocked);
  const hospitalId = (choose.hospitalId && hospitals.some((h) => h.hospital.id === choose.hospitalId) ? choose.hospitalId : hospitals[0]?.hospital.id) ?? null;
  const target = hospitals.find((h) => h.hospital.id === hospitalId);
  const options = target ? routeOptions(incidentNode, target.node, blocked) : [];
  const rec = recommendRoute(options);
  return { incidentNode, units, unitId, hospitals, hospitalId, options, recommended: rec.index, rationale: rec.rationale };
}
