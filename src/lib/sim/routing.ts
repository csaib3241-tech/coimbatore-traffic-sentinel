/**
 * Deterministic routing on the connected OSM road network: Dijkstra shortest
 * (fastest) paths, per-edge travel-time model with static congestion, and
 * "travellers" that drive trip after trip along real roads.
 */
import { buildPolyline, distanceToPath, haversine, type LatLng, type Polyline } from "./geo";
import { ADJ, EDGES, orientedPoints, type RoadClass } from "./network";
import { ACCIDENT_ZONES, CONGESTION } from "./world";

export interface NetRoute {
  nodes: number[];
  edges: number[];
  line: Polyline;
  /** Cumulative distance (m) along `line` at the end of each edge. */
  segEnd: number[];
}

export type TravelMode = "civilian" | "emergency";

/** Free-flow speeds (km/h) per road class. */
export const FREE_FLOW: Record<TravelMode, Record<RoadClass, number>> = {
  civilian: { 0: 60, 1: 48, 2: 40, 3: 32, 4: 30 },
  emergency: { 0: 72, 1: 62, 2: 54, 3: 45, 4: 42 },
};

const CBD: LatLng[] = [[11.0171, 76.966], [10.9935, 76.9627]];

/** Static congestion factor per edge (travel-time multiplier, 1 = free flow). */
export const EDGE_CONGESTION: number[] = EDGES.map((e) => {
  let f = 1;
  for (const c of CONGESTION) {
    if (distanceToPath(e.mid, c.path) < 45) f = Math.max(f, c.level === "heavy" ? 2.4 : 1.6);
  }
  if (f === 1 && e.cls <= 2 && CBD.some((c) => haversine(e.mid, c) < 1400)) f = 1.3;
  if (ACCIDENT_ZONES.some((a) => haversine(e.mid, a.at) < 230)) f += 0.15;
  return Math.round(f * 100) / 100;
});

export function congestionLabel(f: number): "Free flow" | "Light" | "Moderate" | "Heavy" {
  if (f >= 2) return "Heavy";
  if (f >= 1.45) return "Moderate";
  if (f >= 1.12) return "Light";
  return "Free flow";
}

export interface PathOpts {
  mode?: TravelMode;
  blocked?: ReadonlySet<number>;
  /** Extra multiplier per edge (used to find alternative routes). */
  penalty?: ReadonlyMap<number, number>;
  ignoreCongestion?: boolean;
}

export function edgeTravelSec(id: number, mode: TravelMode = "civilian", ignoreCongestion = false): number {
  const e = EDGES[id]!;
  let c = ignoreCongestion ? 1 : EDGE_CONGESTION[id]!;
  if (mode === "emergency") c = 1 + (c - 1) * 0.55; // sirens + priority: congestion hurts less
  return (e.length / (FREE_FLOW[mode][e.cls] / 3.6)) * c;
}

class MinHeap {
  private k: number[] = [];
  private v: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, val: number) {
    const { k, v } = this;
    k.push(key);
    v.push(val);
    let i = k.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p]! <= k[i]!) break;
      [k[p], k[i]] = [k[i]!, k[p]!];
      [v[p], v[i]] = [v[i]!, v[p]!];
      i = p;
    }
  }
  pop(): [number, number] {
    const { k, v } = this;
    const top: [number, number] = [k[0]!, v[0]!];
    const lk = k.pop()!;
    const lv = v.pop()!;
    if (k.length) {
      k[0] = lk;
      v[0] = lv;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && k[l]! < k[m]!) m = l;
        if (r < k.length && k[r]! < k[m]!) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i]!, k[m]!];
        [v[m], v[i]] = [v[i]!, v[m]!];
        i = m;
      }
    }
    return top;
  }
}

/** Fastest path between two nodes (Dijkstra). Returns null when unreachable or from === to. */
export function shortestPath(from: number, to: number, opts: PathOpts = {}): NetRoute | null {
  if (from === to) return null;
  const mode = opts.mode ?? "civilian";
  const n = ADJ.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prevEdge = new Int32Array(n).fill(-1);
  const prevNode = new Int32Array(n).fill(-1);
  const heap = new MinHeap();
  dist[from] = 0;
  heap.push(0, from);
  while (heap.size) {
    const [d, u] = heap.pop();
    if (d > dist[u]!) continue;
    if (u === to) break;
    for (const { edge, to: w } of ADJ[u]!) {
      if (opts.blocked?.has(edge)) continue;
      const cost = edgeTravelSec(edge, mode, opts.ignoreCongestion) * (opts.penalty?.get(edge) ?? 1);
      const nd = d + cost;
      if (nd < dist[w]!) {
        dist[w] = nd;
        prevEdge[w] = edge;
        prevNode[w] = u;
        heap.push(nd, w);
      }
    }
  }
  if (!Number.isFinite(dist[to]!)) return null;
  const nodes = [to];
  const edges: number[] = [];
  for (let x = to; x !== from; x = prevNode[x]!) {
    edges.push(prevEdge[x]!);
    nodes.push(prevNode[x]!);
  }
  return buildRoute(nodes.reverse(), edges.reverse());
}

/** Builds route geometry from a node/edge sequence (nodes.length === edges.length + 1). */
export function buildRoute(nodes: number[], edges: number[]): NetRoute {
  const pts: LatLng[] = [];
  const endIdx: number[] = [];
  edges.forEach((id, i) => {
    const seg = orientedPoints(id, nodes[i]!);
    if (pts.length) pts.push(...seg.slice(1));
    else pts.push(...seg);
    endIdx.push(pts.length - 1);
  });
  const line = buildPolyline(pts.length >= 2 ? pts : [pts[0] ?? [0, 0], pts[0] ?? [0, 0]]);
  return { nodes, edges, line, segEnd: endIdx.map((i) => line.cum[i]!) };
}

/** Index into `route.edges` of the edge containing distance `dist`. */
export function routeEdgeIndex(route: NetRoute, dist: number): number {
  let lo = 0;
  let hi = route.segEnd.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (route.segEnd[mid]! < dist) lo = mid + 1;
    else hi = mid;
  }
  return Math.max(0, lo);
}

/** Distance along the route at which node `k` (index into route.nodes) is reached. */
export const nodeDist = (route: NetRoute, k: number) => (k <= 0 ? 0 : route.segEnd[k - 1]!);

export function routeTimeSec(route: NetRoute, mode: TravelMode = "civilian"): number {
  return route.edges.reduce((a, e) => a + edgeTravelSec(e, mode), 0);
}

/** Travel time (s) left from `dist` to the end of the route. */
export function remainingSec(route: NetRoute, dist: number, mode: TravelMode = "civilian"): number {
  if (!route.edges.length) return 0;
  const k = routeEdgeIndex(route, dist);
  const start = nodeDist(route, k);
  const len = route.segEnd[k]! - start || 1;
  let t = edgeTravelSec(route.edges[k]!, mode) * Math.max(0, Math.min(1, (route.segEnd[k]! - dist) / len));
  for (let i = k + 1; i < route.edges.length; i++) t += edgeTravelSec(route.edges[i]!, mode);
  return t;
}

/* ---------- Travellers: vehicles that drive trip after trip on the network ---------- */

export interface Traveler {
  route: NetRoute;
  dist: number;
  dest: number;
}

/** Moves a traveller `meters` along its trip; on arrival it plans the next trip from its destination. */
export function advanceTraveler(
  t: Traveler,
  meters: number,
  nextDest: (from: number) => number,
  opts: PathOpts = {},
): Traveler {
  let route = t.route;
  let dest = t.dest;
  let dist = t.dist + meters;
  for (let guard = 0; dist >= route.line.length && guard < 4; guard++) {
    const leftover = dist - route.line.length;
    let next: NetRoute | null = null;
    let nd = dest;
    for (let tries = 0; tries < 6 && !next; tries++) {
      nd = nextDest(dest);
      next = shortestPath(dest, nd, opts);
    }
    if (!next) return { route, dest, dist: route.line.length };
    route = next;
    dest = nd;
    dist = leftover;
  }
  return { route, dest, dist: Math.min(dist, route.line.length) };
}
