import { pointAt, seededRandom, type LatLng } from "./geo";
import { classifySpeed, type SpeedLimits, type SpeedStatus, type ZoneType } from "./speed-rules";
import { ROADS, ROAD_IDS, locationLabel, resolveZone, type RoadId } from "./world";

export type VehicleCategory = "Car" | "Two-wheeler" | "Bus" | "Truck" | "Auto-rickshaw";

export interface SimVehicle {
  id: string;
  plate: string;
  category: VehicleCategory;
  road: RoadId;
  dist: number;
  dir: 1 | -1;
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

export interface SeedVehicle {
  plate: string;
  category: VehicleCategory;
  road: RoadId;
  at: number;
  dir: 1 | -1;
  cruise: number;
  speeder: boolean;
}

export function createVehicles(
  count: number,
  seed: number,
  limits: SpeedLimits,
  featured: SeedVehicle[] = [],
  roads: RoadId[] = ROAD_IDS,
): SimVehicle[] {
  const rand = seededRandom(seed);
  const out: SimVehicle[] = [];
  const base = (s: SeedVehicle, i: number): SimVehicle => {
    const pl = ROADS[s.road];
    const dist = pl.length * s.at;
    const pos = pointAt(pl, dist);
    const zr = resolveZone(pos, limits);
    const speed = s.speeder ? s.cruise : Math.min(s.cruise, zr.limit - 4);
    return {
      id: `v${i}`,
      plate: s.plate,
      category: s.category,
      road: s.road,
      dist,
      dir: s.dir,
      cruise: s.cruise,
      speeder: s.speeder,
      speed,
      overSeconds: 0,
      status: "normal",
      zoneType: zr.type,
      zoneId: zr.zone?.id,
      zoneName: zr.zone?.name ?? "Urban Road",
      limit: zr.limit,
      pos,
      location: locationLabel(s.road, pos),
    };
  };
  featured.forEach((f, i) => out.push(base(f, i)));
  for (let i = featured.length; i < count; i++) {
    const category = pickCategory(rand());
    const [lo, hi] = CRUISE[category];
    out.push(
      base(
        {
          plate: makePlate(rand),
          category,
          road: roads[Math.floor(rand() * roads.length)]!,
          at: rand(),
          dir: rand() < 0.5 ? 1 : -1,
          cruise: Math.round(lo + rand() * (hi - lo)),
          speeder: rand() < 0.22,
        },
        i,
      ),
    );
  }
  return out;
}

export interface StepOptions {
  dtSeconds: number;
  timeScale: number;
  limits: SpeedLimits;
  graceSeconds: number;
  rand?: () => number;
}

/** Advances every vehicle one tick: move along its road, resolve zone, compare speed to limit. */
export function stepVehicles(vs: SimVehicle[], o: StepOptions): SimVehicle[] {
  const rand = o.rand ?? Math.random;
  return vs.map((v) => {
    const pl = ROADS[v.road];
    const target =
      v.manualSpeed ?? (v.speeder ? v.cruise : Math.min(v.cruise, Math.max(15, v.limit - 3)));
    const noise = (rand() - 0.5) * 3;
    let speed = v.speed + (target - v.speed) * 0.35 + noise;
    if (v.manualSpeed !== undefined) speed = v.manualSpeed + noise * 0.4;
    speed = Math.max(0, Math.round(speed));

    let dist = v.dist + v.dir * (speed / 3.6) * o.dtSeconds * o.timeScale;
    let dir = v.dir;
    if (dist >= pl.length) {
      dist = pl.length - (dist - pl.length);
      dir = -1;
    } else if (dist <= 0) {
      dist = -dist;
      dir = 1;
    }
    const pos = pointAt(pl, dist);
    const zr = resolveZone(pos, o.limits);
    const over = speed > zr.limit;
    const overSeconds = over ? v.overSeconds + o.dtSeconds : 0;
    const status = classifySpeed(speed, zr.limit, overSeconds, o.graceSeconds);
    return {
      ...v,
      dist,
      dir,
      speed,
      pos,
      overSeconds,
      status,
      zoneType: zr.type,
      zoneId: zr.zone?.id,
      zoneName: zr.zone?.name ?? "Urban Road",
      limit: zr.limit,
      location: locationLabel(v.road, pos),
    };
  });
}
