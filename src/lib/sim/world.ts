import { ROAD_GEOMETRY, type LatLng } from "./road-geometry";
import { buildPolyline, haversine, pointAtFraction, slicePolyline, type Polyline } from "./geo";
import { governingZone, type SpeedLimits, type ZoneType } from "./speed-rules";

export const CITY_CENTER: LatLng = [11.0168, 76.975];

export type RoadId =
  | "avinashi"
  | "trichy"
  | "mettupalayam"
  | "pollachi"
  | "sathy"
  | "marudamalai"
  | "crosscut"
  | "airport";

export const ROAD_NAMES: Record<RoadId, string> = {
  avinashi: "Avinashi Road",
  trichy: "Trichy Road",
  mettupalayam: "Mettupalayam Road",
  pollachi: "Pollachi Road",
  sathy: "Sathy Road",
  marudamalai: "Marudamalai Road",
  crosscut: "Cross Cut Road",
  airport: "Airport Road",
};

export const ROAD_IDS = Object.keys(ROAD_NAMES) as RoadId[];

export const ROADS: Record<RoadId, Polyline> = Object.fromEntries(
  ROAD_IDS.map((id) => [id, buildPolyline(ROAD_GEOMETRY[id])]),
) as Record<RoadId, Polyline>;

export interface Zone {
  id: string;
  name: string;
  type: Exclude<ZoneType, "urban">;
  center: LatLng;
  radius: number;
}

const z = (
  id: string,
  name: string,
  type: Zone["type"],
  road: RoadId,
  at: number,
  radius: number,
): Zone => ({ id, name, type, center: pointAtFraction(ROADS[road], at), radius });

export const ZONES: Zone[] = [
  z("sz-crosscut", "Cross Cut School Zone", "school", "crosscut", 0.42, 340),
  z("sz-peelamedu", "Peelamedu School Zone", "school", "avinashi", 0.42, 360),
  z("sz-ramanathapuram", "Ramanathapuram School Zone", "school", "trichy", 0.38, 340),
  z("sz-saibaba", "Saibaba Colony School Zone", "school", "mettupalayam", 0.12, 340),
  z("sz-kurichi", "Kurichi School Zone", "school", "pollachi", 0.36, 340),
  z("sz-vadavalli", "Vadavalli School Zone", "school", "marudamalai", 0.62, 340),
  z("rz-ganapathy", "Ganapathy Residential", "residential", "sathy", 0.5, 650),
  z("rz-rspuram", "RS Puram Residential", "residential", "marudamalai", 0.22, 600),
  z("rz-sowripalayam", "Sowripalayam Residential", "residential", "trichy", 0.78, 650),
  z("rz-gopalapuram", "Gopalapuram Residential", "residential", "avinashi", 0.82, 520),
  z("hz-thudiyalur", "NH-181 Thudiyalur Highway", "highway", "mettupalayam", 0.82, 1500),
  z("hz-eachanari", "NH-83 Eachanari Highway", "highway", "pollachi", 0.86, 1300),
  z("hz-airport", "Airport Expressway", "highway", "airport", 0.68, 1250),
];

export interface Landmark {
  name: string;
  at: LatLng;
}

export const LANDMARKS: Landmark[] = [
  { name: "Gandhipuram", at: [11.0171, 76.966] },
  { name: "Lakshmi Mills Jn", at: [11.0105, 76.9815] },
  { name: "Nava India", at: [11.0175, 76.9935] },
  { name: "Peelamedu", at: [11.0235, 77.0085] },
  { name: "Hope College", at: [11.0279, 77.024] },
  { name: "Airport Jn", at: [11.0335, 77.038] },
  { name: "Town Hall", at: [10.9935, 76.9627] },
  { name: "Ukkadam", at: [10.989, 76.9615] },
  { name: "Ramanathapuram", at: [10.9975, 76.9905] },
  { name: "Singanallur", at: [11.0003, 77.025] },
  { name: "Saibaba Colony", at: [11.026, 76.95] },
  { name: "Thudiyalur", at: [11.07, 76.9425] },
  { name: "Kurichi", at: [10.962, 76.968] },
  { name: "Eachanari", at: [10.944, 76.978] },
  { name: "Ganapathy", at: [11.0425, 76.98] },
  { name: "RS Puram", at: [11.0105, 76.95] },
  { name: "Vadavalli", at: [11.0215, 76.913] },
  { name: "Saravanampatti", at: [11.078, 76.998] },
  { name: "Kalapatti", at: [11.066, 77.04] },
  { name: "Podanur", at: [10.968, 76.99] },
  // Outside the city geofence
  { name: "Periyanaickenpalayam", at: [11.152, 76.95] },
  { name: "Narasimhanaickenpalayam", at: [11.128, 76.948] },
  { name: "Neelambur", at: [11.058, 77.085] },
  { name: "Sulur", at: [11.025, 77.125] },
  { name: "Chettipalayam", at: [10.912, 77.03] },
  { name: "Madukkarai", at: [10.905, 76.96] },
  { name: "Malumichampatti", at: [10.905, 76.998] },
  { name: "Perur", at: [10.975, 76.913] },
  { name: "Thondamuthur", at: [10.99, 76.85] },
];

export function nearestLandmark(p: LatLng): string {
  let best = LANDMARKS[0]!;
  let bd = Infinity;
  for (const l of LANDMARKS) {
    const d = haversine(p, l.at);
    if (d < bd) {
      bd = d;
      best = l;
    }
  }
  return best.name;
}

export function locationLabel(roadName: string, p: LatLng): string {
  return `${roadName}, near ${nearestLandmark(p)}`;
}

export interface ZoneResolution {
  type: ZoneType;
  zone?: Zone | undefined;
  limit: number;
}

export function resolveZone(p: LatLng, limits: SpeedLimits, zones: Zone[] = ZONES): ZoneResolution {
  const inside = zones.filter((zn) => haversine(p, zn.center) <= zn.radius);
  const type = governingZone(inside.map((zn) => zn.type));
  return { type, zone: inside.find((zn) => zn.type === type), limit: limits[type] };
}

/* ---------- Dashboard overlays ---------- */

export const ACCIDENT_ZONES: { name: string; at: LatLng; incidents: number }[] = [
  { name: "Lakshmi Mills Junction", at: [11.0105, 76.9815], incidents: 23 },
  { name: "Ukkadam Bus Terminus", at: [10.989, 76.9615], incidents: 31 },
  { name: "Hope College Junction", at: [11.0279, 77.024], incidents: 18 },
  { name: "Singanallur Signal", at: [11.0003, 77.025], incidents: 15 },
];

export const CONGESTION: { name: string; level: "heavy" | "moderate"; path: LatLng[] }[] = [
  { name: "Cross Cut Road", level: "heavy", path: slicePolyline(ROADS.crosscut, 0, ROADS.crosscut.length * 0.35) },
  { name: "Avinashi Road (Lakshmi Mills)", level: "heavy", path: slicePolyline(ROADS.avinashi, ROADS.avinashi.length * 0.7, ROADS.avinashi.length * 0.95) },
  { name: "Trichy Road (Ramanathapuram)", level: "moderate", path: slicePolyline(ROADS.trichy, ROADS.trichy.length * 0.25, ROADS.trichy.length * 0.5) },
  { name: "Mettupalayam Road", level: "moderate", path: slicePolyline(ROADS.mettupalayam, 0, ROADS.mettupalayam.length * 0.25) },
];

export const SIGNAL_POINTS: { name: string; at: LatLng; phase: number }[] = [
  { name: "Gandhipuram Signal", at: [11.0171, 76.966], phase: 0 },
  { name: "Lakshmi Mills Signal", at: [11.0105, 76.9815], phase: 3 },
  { name: "Nava India Signal", at: [11.0175, 76.9935], phase: 6 },
  { name: "Peelamedu Signal", at: [11.0235, 77.0085], phase: 2 },
  { name: "Hope College Signal", at: [11.0279, 77.024], phase: 5 },
  { name: "Town Hall Signal", at: [10.9935, 76.9627], phase: 1 },
  { name: "Ramanathapuram Signal", at: [10.9975, 76.9905], phase: 4 },
  { name: "Saibaba Colony Signal", at: [11.026, 76.95], phase: 7 },
  { name: "Ukkadam Signal", at: [10.989, 76.9615], phase: 2 },
];

/** Normal fixed-time signal cycle: 4 ticks green, 1 amber, 4 red. */
export function signalPhase(tick: number, offset: number): "green" | "amber" | "red" {
  const t = (tick + offset) % 9;
  if (t < 4) return "green";
  if (t < 5) return "amber";
  return "red";
}

/* ---------- Emergency destinations ---------- */

export interface Hospital {
  id: "kmch" | "cmch" | "srh";
  name: string;
  short: string;
  at: LatLng;
}

export const HOSPITALS: Hospital[] = [
  { id: "kmch", name: "KMCH Speciality Hospital, Avinashi Road", short: "KMCH", at: [11.04178, 77.03966] },
  { id: "cmch", name: "Government Medical College Hospital", short: "CMCH", at: [10.99639, 76.9705] },
  { id: "srh", name: "Sri Ramakrishna Hospital", short: "SRH", at: [11.01982, 76.97665] },
];
