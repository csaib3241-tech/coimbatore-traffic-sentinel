import { seededRandom } from "./sim/geo";

export type Range = "today" | "7d" | "30d";
export type ZoneFilter = "all" | "school" | "residential" | "highway" | "urban";

export const RANGE_LABEL: Record<Range, string> = { today: "Today", "7d": "Last 7 Days", "30d": "Last 30 Days" };

const ZONE_SHARE: Record<Exclude<ZoneFilter, "all">, number> = { school: 0.22, residential: 0.27, highway: 0.31, urban: 0.2 };

/** Deterministic demo analytics so the charts look identical on every render. */
export function buildAnalytics(range: Range, zone: ZoneFilter) {
  const rand = seededRandom(range === "today" ? 11 : range === "7d" ? 77 : 303);
  const share = zone === "all" ? 1 : ZONE_SHARE[zone];
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  const points =
    range === "today"
      ? Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`)
      : range === "7d"
        ? days
        : Array.from({ length: 30 }, (_, i) => `D${i + 1}`);

  const traffic = points.map((label, i) => {
    let base: number;
    if (range === "today") {
      const peak = Math.exp(-((i - 9) ** 2) / 6) * 1 + Math.exp(-((i - 18.5) ** 2) / 5) * 1.1;
      base = 900 + peak * 5200;
    } else {
      base = 118_000 + (i % 7 >= 5 ? -22_000 : 6_000);
    }
    const vehicles = Math.round(base * (0.9 + rand() * 0.2));
    return { label, vehicles, cars: Math.round(vehicles * 0.52), twoWheelers: Math.round(vehicles * 0.3) };
  });

  const scale = range === "today" ? 1 : range === "7d" ? 18 : 16;
  const violations = points.map((label, i) => {
    const peakish = range === "today" ? 4 + Math.exp(-((i - 22) ** 2) / 8) * 18 + Math.exp(-((i - 14) ** 2) / 10) * 8 : 14;
    const speed = Math.round(peakish * scale * share * (0.75 + rand() * 0.5));
    const verified = Math.round(speed * (0.55 + rand() * 0.2));
    return { label, speed, verified, rejected: Math.round(speed * (0.06 + rand() * 0.05)) };
  });

  const totalSpeed = violations.reduce((a, v) => a + v.speed, 0);
  const zones = (["school", "residential", "highway", "urban"] as const).map((z) => ({
    zone: z === "school" ? "School" : z === "residential" ? "Residential" : z === "highway" ? "Highway" : "Urban",
    key: z,
    violations: Math.round((totalSpeed / share) * ZONE_SHARE[z] * (0.9 + rand() * 0.2)),
  }));

  const response = (range === "today" ? ["06:00", "09:00", "12:00", "15:00", "18:00", "21:00"] : range === "7d" ? days : ["Week 1", "Week 2", "Week 3", "Week 4"]).map((label) => {
    const without = 10.5 + rand() * 3;
    return { label, without: +without.toFixed(1), with: +(without * (0.56 + rand() * 0.08)).toFixed(1) };
  });

  const categories = [
    { name: "Cars", value: 52 },
    { name: "Two-wheelers", value: 30 },
    { name: "Auto-rickshaws", value: 8 },
    { name: "Trucks", value: 6 },
    { name: "Buses", value: 4 },
  ];

  const accidents = (range === "30d" ? ["Week 1", "Week 2", "Week 3", "Week 4"] : range === "7d" ? days : ["00–06", "06–10", "10–16", "16–20", "20–24"]).map((label) => ({
    label,
    minor: Math.round((range === "today" ? 2 : 9) * share * (0.6 + rand())),
    serious: Math.round((range === "today" ? 1 : 4) * share * (0.5 + rand())),
    fatal: Math.round((range === "today" ? 0.4 : 1.2) * share * rand() * 2),
  }));

  const totalVehicles = traffic.reduce((a, t) => a + t.vehicles, 0);
  const verifiedTotal = violations.reduce((a, v) => a + v.verified, 0);
  const avgWith = response.reduce((a, r) => a + r.with, 0) / response.length;
  const avgWithout = response.reduce((a, r) => a + r.without, 0) / response.length;

  return {
    traffic,
    violations,
    zones,
    response,
    categories,
    accidents,
    kpis: {
      totalVehicles,
      totalSpeed,
      verifiedTotal,
      verificationRate: totalSpeed ? verifiedTotal / totalSpeed : 0,
      avgWith,
      improvement: 1 - avgWith / avgWithout,
    },
  };
}

/** 2024 India road safety reference figures from the project presentation (not live data). */
export const INDIA_2024 = {
  accidents: 487_707,
  deaths: 177_175,
  speeding: 345_024,
};
