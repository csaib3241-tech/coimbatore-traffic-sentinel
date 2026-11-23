/**
 * Connected Coimbatore road network decoded from pre-fetched OpenStreetMap data
 * (`road-network-data.ts`). Nodes are junctions / signal points, edges are road
 * segments with real geometry. Every edge is traversable in both directions.
 */
import { NET_EDGES, NET_NAMES, NET_NODES, NET_SIGNALS } from "./road-network-data";
import { buildPolyline, haversine, pointAtFraction, pointSegmentDistance, type LatLng } from "./geo";

export type RoadClass = 0 | 1 | 2 | 3 | 4;

export const ROAD_CLASS_LABEL: Record<RoadClass, string> = {
  0: "Highway",
  1: "Arterial road",
  2: "Main road",
  3: "Link road",
  4: "City street",
};

export interface NetEdge {
  id: number;
  a: number;
  b: number;
  name: string;
  cls: RoadClass;
  pts: LatLng[];
  length: number;
  mid: LatLng;
}

export interface NetAdj {
  edge: number;
  to: number;
}

export const NODES: LatLng[] = [];
for (let i = 0; i + 1 < NET_NODES.length; i += 2) NODES.push([NET_NODES[i]! / 1e5, NET_NODES[i + 1]! / 1e5]);

export const EDGES: NetEdge[] = NET_EDGES.map((row, id) => {
  const a = row[0]!;
  const b = row[1]!;
  const pts: LatLng[] = [NODES[a]!];
  let la = NET_NODES[a * 2]!;
  let lo = NET_NODES[a * 2 + 1]!;
  for (let k = 4; k + 1 < row.length; k += 2) {
    la += row[k]!;
    lo += row[k + 1]!;
    pts.push([la / 1e5, lo / 1e5]);
  }
  pts.push(NODES[b]!);
  const pl = buildPolyline(pts);
  return {
    id,
    a,
    b,
    name: NET_NAMES[row[2]!] ?? "",
    cls: Math.min(4, Math.max(0, row[3]!)) as RoadClass,
    pts,
    length: Math.max(1, pl.length),
    mid: pointAtFraction(pl, 0.5),
  };
});

export const ADJ: NetAdj[][] = NODES.map(() => []);
for (const e of EDGES) {
  ADJ[e.a]!.push({ edge: e.id, to: e.b });
  ADJ[e.b]!.push({ edge: e.id, to: e.a });
}

/** Junctions tagged `highway=traffic_signals` in OpenStreetMap. */
export const SIGNAL_NODES: ReadonlySet<number> = new Set(NET_SIGNALS);

export function edgeLabel(id: number): string {
  const e = EDGES[id];
  if (!e) return "Road";
  return e.name || ROAD_CLASS_LABEL[e.cls];
}

/** Edge vertices oriented to start at `fromNode`. */
export function orientedPoints(id: number, fromNode: number): LatLng[] {
  const e = EDGES[id]!;
  return e.a === fromNode ? e.pts : [...e.pts].reverse();
}

export function nearestNode(p: LatLng, filter?: (n: number) => boolean): number {
  let best = 0;
  let bd = Infinity;
  for (let i = 0; i < NODES.length; i++) {
    if (filter && !filter(i)) continue;
    const d = haversine(p, NODES[i]!);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/* ---------- Spatial index (grid) for edge lookups ---------- */

const CELL = 0.004;
const grid = new Map<string, number[]>();
for (const e of EDGES) {
  const seen = new Set<string>();
  for (let i = 1; i < e.pts.length; i++) {
    const [a0, o0] = e.pts[i - 1]!;
    const [a1, o1] = e.pts[i]!;
    for (let la = Math.floor(Math.min(a0, a1) / CELL); la <= Math.floor(Math.max(a0, a1) / CELL); la++) {
      for (let lo = Math.floor(Math.min(o0, o1) / CELL); lo <= Math.floor(Math.max(o0, o1) / CELL); lo++) {
        const k = `${la}:${lo}`;
        if (seen.has(k)) continue;
        seen.add(k);
        const arr = grid.get(k);
        if (arr) arr.push(e.id);
        else grid.set(k, [e.id]);
      }
    }
  }
}

export function edgeDistance(id: number, p: LatLng): number {
  const pts = EDGES[id]!.pts;
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) best = Math.min(best, pointSegmentDistance(p, pts[i - 1]!, pts[i]!));
  return best;
}

/** Edges with any part within `radius` metres of `p`. */
export function edgesNear(p: LatLng, radius: number): number[] {
  const r = Math.ceil(radius / 440) + 1;
  const cla = Math.floor(p[0] / CELL);
  const clo = Math.floor(p[1] / CELL);
  const cand = new Set<number>();
  for (let i = -r; i <= r; i++)
    for (let j = -r; j <= r; j++) grid.get(`${cla + i}:${clo + j}`)?.forEach((id) => cand.add(id));
  return [...cand].filter((id) => edgeDistance(id, p) <= radius);
}

export function nearestEdge(p: LatLng): number {
  for (const radius of [60, 250, 1000, 4000]) {
    const near = edgesNear(p, radius);
    if (near.length) return near.reduce((b, id) => (edgeDistance(id, p) < edgeDistance(b, p) ? id : b));
  }
  let best = 0;
  for (const e of EDGES) if (edgeDistance(e.id, p) < edgeDistance(best, p)) best = e.id;
  return best;
}
