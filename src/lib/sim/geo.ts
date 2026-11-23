import type { LatLng } from "./road-geometry";

export type { LatLng };

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversine(a: LatLng, b: LatLng): number {
  const dLat = rad(b[0] - a[0]);
  const dLng = rad(b[1] - a[1]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export interface Polyline {
  pts: LatLng[];
  cum: number[];
  length: number;
}

export function buildPolyline(pts: LatLng[]): Polyline {
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1]! + haversine(pts[i - 1]!, pts[i]!));
  return { pts, cum, length: cum[cum.length - 1]! };
}

/** Point at `dist` metres along the polyline (clamped to its ends). */
export function pointAt(pl: Polyline, dist: number): LatLng {
  const d = Math.max(0, Math.min(pl.length, dist));
  let i = 1;
  while (i < pl.cum.length - 1 && pl.cum[i]! < d) i++;
  const segStart = pl.cum[i - 1]!;
  const segLen = pl.cum[i]! - segStart || 1;
  const t = (d - segStart) / segLen;
  const a = pl.pts[i - 1]!;
  const b = pl.pts[i]!;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

export function pointAtFraction(pl: Polyline, f: number): LatLng {
  return pointAt(pl, pl.length * f);
}

/** Vertices of the polyline between two distances — for drawing partial routes. */
export function slicePolyline(pl: Polyline, from: number, to: number): LatLng[] {
  const a = Math.max(0, Math.min(from, to));
  const b = Math.min(pl.length, Math.max(from, to));
  const out: LatLng[] = [pointAt(pl, a)];
  for (let i = 0; i < pl.pts.length; i++) {
    if (pl.cum[i]! > a && pl.cum[i]! < b) out.push(pl.pts[i]!);
  }
  out.push(pointAt(pl, b));
  return out;
}

/** Deterministic PRNG (mulberry32) so server and browser render the same demo data. */
export function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Distance in metres from `p` to segment a–b (local equirectangular projection; accurate at city scale). */
export function pointSegmentDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const k = Math.cos(rad(a[0]));
  const ax = a[1] * k * 111320, ay = a[0] * 110540;
  const bx = b[1] * k * 111320, by = b[0] * 110540;
  const px = p[1] * k * 111320, py = p[0] * 110540;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}

/** Shortest distance in metres from `p` to a polyline given as vertices. */
export function distanceToPath(p: LatLng, path: LatLng[]): number {
  if (path.length === 1) return haversine(p, path[0]!);
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, pointSegmentDistance(p, path[i - 1]!, path[i]!));
  return best;
}
