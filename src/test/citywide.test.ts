import { describe, expect, it } from "vitest";
import { seededRandom } from "@/lib/sim/geo";
import { DEFAULT_LIMITS } from "@/lib/sim/speed-rules";
import { CBE_GEOFENCE, geofenceStep, initialGeoState, insidePolygon } from "@/lib/sim/geofence";
import { NODES, nearestNode } from "@/lib/sim/network";
import { shortestPath } from "@/lib/sim/routing";
import { createVehicles, stepVehicles, collectGeofenceEvents, type SimVehicle } from "@/lib/sim/traffic";
import { CITY_CENTER, HOSPITALS, ROADS, ZONES } from "@/lib/sim/world";
import { pointAtFraction, haversine } from "@/lib/sim/geo";
import {
  DEMO_TEMPLATE,
  blockedAhead,
  pickBlockage,
  planMission,
  recommendRoute,
  rerouteFrom,
} from "@/lib/sim/emergency";

const GANDHIPURAM: [number, number] = [11.0171, 76.966];
const NEELAMBUR: [number, number] = [11.058, 77.085];
const PERIYANAICKENPALAYAM: [number, number] = [11.152, 76.95];

describe("Coimbatore geofence", () => {
  it("contains the city centre and excludes towns outside it", () => {
    expect(insidePolygon(CITY_CENTER)).toBe(true);
    expect(insidePolygon(GANDHIPURAM)).toBe(true);
    expect(insidePolygon(NEELAMBUR)).toBe(false);
    expect(insidePolygon(PERIYANAICKENPALAYAM)).toBe(false);
    expect(CBE_GEOFENCE.length).toBeGreaterThan(8);
  });

  it("exit deactivates local monitoring, keeps history and counts a handoff", () => {
    const inside = initialGeoState(true, 1);
    const { state, event } = geofenceStep(inside, false, 100);
    expect(event).toBe("exit");
    expect(state.mode).toBe("external");
    expect(state.handoffs).toBe(1);
    expect(state.session).toBeNull();
    expect(state.retained).toHaveLength(1);
    expect(state.retained[0]!.endedAt).toBe(100);
  });

  it("first crossing in is an entry; coming back after an exit is a re-entry that reactivates monitoring", () => {
    const outside = initialGeoState(false);
    const a = geofenceStep(outside, true, 10);
    expect(a.event).toBe("entry");
    expect(a.state.mode).toBe("local");
    const b = geofenceStep(a.state, false, 20);
    const c = geofenceStep(b.state, true, 30);
    expect(c.event).toBe("reentry");
    expect(c.state.mode).toBe("local");
    expect(c.state.retained).toHaveLength(1);
    expect(c.state.entries).toBe(2);
  });

  it("no event while staying on the same side", () => {
    const s = initialGeoState(true);
    expect(geofenceStep(s, true, 5).event).toBeNull();
  });
});

describe("connected road network", () => {
  it("connects the city centre with roads outside the city", () => {
    const a = nearestNode(GANDHIPURAM);
    for (const p of [NEELAMBUR, PERIYANAICKENPALAYAM, ...HOSPITALS.map((h) => h.at)]) {
      const r = shortestPath(a, nearestNode(p));
      expect(r).not.toBeNull();
      expect(r!.line.length).toBeGreaterThan(500);
    }
  });

  it("has junctions both inside and outside the geofence", () => {
    const inside = NODES.filter((p) => insidePolygon(p)).length;
    expect(inside).toBeGreaterThan(300);
    expect(NODES.length - inside).toBeGreaterThan(150);
  });
});

function run(vs: SimVehicle[], ticks: number, seed = 7) {
  const rand = seededRandom(seed);
  const events: ReturnType<typeof collectGeofenceEvents> = [];
  let cur = vs;
  for (let i = 0; i < ticks; i++) {
    cur = stepVehicles(cur, { dtSeconds: 0.5, timeScale: 12, limits: DEFAULT_LIMITS, graceSeconds: 3, rand, now: 1000 + i * 500 });
    events.push(...collectGeofenceEvents(cur));
  }
  return { cur, events };
}

describe("city-wide vehicle movement", () => {
  it("spawns vehicles across the network, not at one point", () => {
    const vs = createVehicles(46, 2026, DEFAULT_LIMITS);
    const far = vs.filter((v) => haversine(v.pos, CITY_CENTER) > 3000).length;
    expect(far).toBeGreaterThan(15);
    expect(vs.some((v) => !insidePolygon(v.pos))).toBe(true);
  });

  it("vehicles are not confined: they leave and re-enter the city, with monitoring switching", () => {
    const { cur, events } = run(createVehicles(46, 2026, DEFAULT_LIMITS), 900);
    expect(events.some((e) => e.kind === "exit")).toBe(true);
    expect(events.some((e) => e.kind === "entry" || e.kind === "reentry")).toBe(true);
    const outside = cur.filter((v) => !insidePolygon(v.pos));
    expect(outside.length).toBeGreaterThan(0);
    // Outside the city no local violation is raised.
    expect(outside.every((v) => v.geo.mode === "external" && v.status === "normal")).toBe(true);
  });

  it("exit events carry the retained local session for the external handoff", () => {
    const { events } = run(createVehicles(46, 2026, DEFAULT_LIMITS), 900);
    const exit = events.find((e) => e.kind === "exit");
    expect(exit?.session).toBeDefined();
  });

  it("featured school-zone vehicle drives along Cross Cut Road through the school zone", () => {
    const vs = createVehicles(1, 1, DEFAULT_LIMITS, [
      { plate: "TN 37 AB 1234", category: "Car", from: pointAtFraction(ROADS.crosscut, 0.24), to: pointAtFraction(ROADS.crosscut, 0.75), cruise: 58, speeder: true },
    ]);
    const school = ZONES.find((z) => z.id === "sz-crosscut")!;
    const trip = vs[0]!.trip;
    let passes = false;
    for (let d = 0; d < trip.line.length; d += 20) if (haversine(pointAtFraction(trip.line, d / trip.line.length), school.center) < school.radius) passes = true;
    expect(passes).toBe(true);
  });
});

describe("emergency route intelligence", () => {
  const plan = planMission(DEMO_TEMPLATE.at, new Set());

  it("ranks available ambulances by computed travel time and skips busy ones", () => {
    expect(plan.units.length).toBeGreaterThan(1);
    expect(plan.units.some((u) => u.unit.id === "AMB 014")).toBe(false);
    for (let i = 1; i < plan.units.length; i++) expect(plan.units[i]!.timeSec).toBeGreaterThanOrEqual(plan.units[i - 1]!.timeSec);
    expect(plan.unitId).toBe(plan.units[0]!.unit.id);
  });

  it("compares at least two distinct routes and recommends the fastest unblocked one", () => {
    expect(plan.options.length).toBeGreaterThanOrEqual(2);
    const fastest = Math.min(...plan.options.map((o) => o.timeSec));
    expect(plan.options[plan.recommended]!.timeSec).toBe(fastest);
    expect(new Set(plan.options.map((o) => o.route.edges.join(","))).size).toBe(plan.options.length);
  });

  it("never recommends a blocked route", () => {
    const blockedFirst = plan.options.map((o, i) => (i === plan.recommended ? { ...o, blockedEdges: 1 } : o));
    const rec = recommendRoute(blockedFirst);
    expect(rec.index).not.toBe(plan.recommended);
  });

  it("a blockage ahead triggers a reroute that avoids every blocked road and still reaches the hospital", () => {
    const route = plan.options[plan.recommended]!.route;
    const target = plan.hospitals.find((h) => h.hospital.id === plan.hospitalId)!.node;
    const dist = route.line.length * 0.2;
    const b = pickBlockage(route, dist, target, 300)!;
    expect(b).not.toBeNull();
    const blocked = new Set(b.edges);
    expect(blockedAhead(route, dist, blocked)).toBe(true);
    const r = rerouteFrom(route, dist, target, blocked)!;
    expect(r).not.toBeNull();
    expect(r.route.edges.slice(1).some((e) => blocked.has(e))).toBe(false);
    expect(r.route.nodes[r.route.nodes.length - 1]).toBe(target);
  });
});
