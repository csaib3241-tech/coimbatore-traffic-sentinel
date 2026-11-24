import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Car,
  CheckCircle2,
  Gauge,
  Layers,
  LogIn,
  LogOut,
  MapPinned,
  RefreshCw,
  ScanLine,
  ShieldCheck,
  Siren,
  TrafficCone,
} from "lucide-react";
import { StatCard } from "@/components/common/StatCard";
import { LiveDot, PageHeader, Panel, TimeText } from "@/components/common/ui-bits";
import { MapCanvas } from "@/components/map/MapCanvas";
import { useLeafletMap } from "@/components/map/useLeafletMap";
import { useGeofenceLayer, useVehicleLayer, useZoneLayer } from "@/components/map/layers";
import { emergencyIcon, pinIcon, signalIcon, type EmergencyKind } from "@/components/map/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { actions, useAppStore } from "@/lib/store";
import { collectGeofenceEvents, createVehicles, pickDestination, type SimVehicle } from "@/lib/sim/traffic";
import { useTrafficSim } from "@/lib/sim/useTrafficSim";
import { pointAt, seededRandom, type LatLng } from "@/lib/sim/geo";
import { EDGES, NODES, edgeLabel, nearestNode } from "@/lib/sim/network";
import { advanceTraveler, routeEdgeIndex, shortestPath, type Traveler } from "@/lib/sim/routing";
import { EXTERNAL_AI } from "@/lib/sim/geofence";
import {
  ACCIDENT_ZONES,
  CITY_CENTER,
  CONGESTION,
  HOSPITALS,
  SIGNAL_POINTS,
  ZONES,
  locationLabel,
  nearestLandmark,
  signalPhase,
  type Zone,
} from "@/lib/sim/world";
import { ZONE_LABEL } from "@/lib/sim/speed-rules";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Command Centre — Sentinel Road" },
      {
        name: "description",
        content: "Live smart-road command centre: vehicles, speed zones, violations and emergency units on one interactive map.",
      },
      { property: "og:title", content: "Sentinel Road Command Centre" },
      {
        property: "og:description",
        content: "Intelligent Roads. Safer Journeys. Faster Emergency Response — live traffic map and system overview.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Dashboard,
});

type FilterKey = "normal" | "warning" | "violation" | "outside" | "emergency" | "zones" | "geofence" | "network" | "accident" | "congestion" | "signals";

const FILTERS: { key: FilterKey; label: string; swatch: string }[] = [
  { key: "normal", label: "Normal vehicles", swatch: "bg-safe" },
  { key: "warning", label: "Speed warning", swatch: "bg-warning" },
  { key: "violation", label: "Speed violation", swatch: "bg-critical" },
  { key: "outside", label: "Outside city (handed off)", swatch: "bg-muted-foreground" },
  { key: "emergency", label: "Emergency vehicles", swatch: "bg-emergency" },
  { key: "zones", label: "Speed & school zones", swatch: "bg-primary" },
  { key: "geofence", label: "Coimbatore geofence", swatch: "bg-primary" },
  { key: "network", label: "Road network", swatch: "bg-muted-foreground" },
  { key: "accident", label: "Accident-prone zones", swatch: "bg-warning" },
  { key: "congestion", label: "Congestion", swatch: "bg-critical" },
  { key: "signals", label: "Traffic signals", swatch: "bg-safe" },
];

interface Unit {
  id: string;
  kind: EmergencyKind;
  label: string;
  speed: number;
  /** Drives trip after trip on the connected road network. */
  t: Traveler;
}

interface FeedItem {
  id: string;
  plate: string;
  speed: number;
  limit: number;
  zone: string;
  ts: number;
}

function initialUnits(): Unit[] {
  const rand = seededRandom(77);
  const mk = (id: string, kind: EmergencyKind, label: string, from: LatLng, speed: number): Unit => {
    const a = nearestNode(from);
    let dest = pickDestination(rand, a, 0.15);
    let route = shortestPath(a, dest, { mode: "emergency" });
    while (!route) {
      dest = pickDestination(rand, a, 0.15);
      route = shortestPath(a, dest, { mode: "emergency" });
    }
    return { id, kind, label, speed, t: { route, dist: 0, dest } };
  };
  return [
    mk("AMB 006", "ambulance", "Ambulance", HOSPITALS[0]!.at, 52),
    mk("FIRE 02", "fire", "Fire engine", [11.0003, 77.025], 46),
    mk("PCR 07", "police", "Police patrol", [11.0425, 76.98], 40),
  ];
}

const unitPos = (u: Unit) => pointAt(u.t.route.line, u.t.dist);
const unitDestination = (u: Unit) => nearestLandmark(NODES[u.t.dest]!);
const unitLocation = (u: Unit) => locationLabel(edgeLabel(u.t.route.edges[routeEdgeIndex(u.t.route, u.t.dist)] ?? 0), unitPos(u));

function Dashboard() {
  const limits = useAppStore((s) => s.limits);
  const graceSeconds = useAppStore((s) => s.graceSeconds);
  const timeScale = useAppStore((s) => s.settings.timeScale);
  const verifiedCount = useAppStore((s) => s.violations.filter((v) => v.status === "verified").length);
  const pendingCount = useAppStore((s) => s.violations.filter((v) => v.status === "pending").length);
  const emergencyActive = useAppStore((s) => s.emergencyActive);

  const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
    normal: true, warning: true, violation: true, outside: true, emergency: true, zones: true, geofence: true, network: false, accident: true, congestion: true, signals: true,
  });
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [monitored, setMonitored] = useState(128_452);

  const onTick = useCallback((prev: SimVehicle[], next: SimVehicle[]) => {
    const fresh: FeedItem[] = [];
    next.forEach((v, i) => {
      if (v.status === "violation" && prev[i]?.status !== "violation") {
        fresh.push({ id: `${v.id}-${Date.now()}`, plate: v.plate, speed: v.speed, limit: v.limit, zone: v.zoneType === "urban" ? `${ZONE_LABEL.urban} · ${nearestLandmark(v.pos)}` : v.zoneName, ts: Date.now() });
      }
    });
    if (fresh.length) setFeed((f) => [...fresh, ...f].slice(0, 9));
    actions.recordGeofence(collectGeofenceEvents(next));
    setMonitored((m) => m + 2 + Math.floor(Math.random() * 9));
  }, []);

  const { vehicles, tick } = useTrafficSim(() => createVehicles(46, 2026, limits), {
    running: true,
    limits,
    graceSeconds,
    timeScale,
    onTick,
  });

  const [units, setUnits] = useState<Unit[]>(initialUnits);
  useEffect(() => {
    if (!tick) return;
    setUnits((us) =>
      us.map((u) => ({
        ...u,
        t: advanceTraveler(u.t, (u.speed / 3.6) * 0.5 * timeScale, (from) => pickDestination(Math.random, from, 0.15), { mode: "emergency" }),
      })),
    );
  }, [tick, timeScale]);

  const stats = useMemo(() => {
    const violations = vehicles.filter((v) => v.status === "violation").length;
    const warnings = vehicles.filter((v) => v.status === "warning").length;
    const avg = vehicles.reduce((a, v) => a + v.speed, 0) / Math.max(1, vehicles.length);
    const outside = vehicles.filter((v) => v.geo.mode === "external").length;
    return { violations, warnings, avg, outside, inside: vehicles.length - outside };
  }, [vehicles]);

  /* ---------- Map ---------- */
  const mapRef = useRef<HTMLDivElement>(null);
  const ctx = useLeafletMap(mapRef, { center: CITY_CENTER, zoom: 12 });

  const visibleVehicle = useCallback(
    (v: SimVehicle) => (v.geo.mode === "external" ? filters.outside : filters[v.status]),
    [filters],
  );
  useGeofenceLayer(ctx, filters.geofence);
  const geofence = useAppStore((s) => s.geofence);

  // Connected road network used for vehicle trips and emergency routing
  useEffect(() => {
    if (!ctx || !filters.network) return;
    const { L, map } = ctx;
    const g = L.layerGroup().addTo(map);
    EDGES.forEach((e) => L.polyline(e.pts, { color: "var(--primary)", weight: e.cls <= 1 ? 2 : 1, opacity: 0.35, interactive: false }).addTo(g));
    return () => {
      g.remove();
    };
  }, [ctx, filters.network]);
  useVehicleLayer(ctx, vehicles, { visible: visibleVehicle, showTags: (v) => v.status === "violation" });

  const showZone = useCallback((_z: Zone) => filters.zones, [filters.zones]);
  useZoneLayer(ctx, ZONES, limits, showZone);

  // Static overlays: accident-prone zones, congestion, hospitals
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const g = L.layerGroup().addTo(map);
    if (filters.congestion) {
      CONGESTION.forEach((c) => {
        L.polyline(c.path, {
          color: c.level === "heavy" ? "var(--critical)" : "var(--warning)",
          weight: 9,
          opacity: 0.38,
          lineCap: "round",
        })
          .bindTooltip(`<b>${c.name}</b><br/>${c.level === "heavy" ? "Heavy congestion · avg 11 km/h" : "Moderate traffic · avg 24 km/h"}`, { sticky: true })
          .addTo(g);
      });
    }
    if (filters.accident) {
      ACCIDENT_ZONES.forEach((a) => {
        L.circle(a.at, { radius: 230, color: "var(--warning)", weight: 1, fillColor: "var(--warning)", fillOpacity: 0.16 }).addTo(g);
        L.marker(a.at, { icon: pinIcon(L, "accident") })
          .bindPopup(`<div class="popup-title">${a.name}</div><dl class="popup-grid"><dt>Category</dt><dd>Accident-prone zone</dd><dt>Incidents (12 mo)</dt><dd>${a.incidents}</dd><dt>Mitigation</dt><dd>Reduced limit + camera</dd></dl>`)
          .addTo(g);
      });
    }
    HOSPITALS.forEach((h) => {
      L.marker(h.at, { icon: pinIcon(L, "hospital") }).bindTooltip(h.name).addTo(g);
    });
    return () => {
      g.remove();
    };
  }, [ctx, filters.congestion, filters.accident]);

  // Traffic signals (cycle each tick)
  const signalMarkers = useRef<Leaflet.Marker[]>([]);
  useEffect(() => {
    if (!ctx || !filters.signals) return;
    const { L, map } = ctx;
    signalMarkers.current = SIGNAL_POINTS.map((s) =>
      L.marker(s.at, { icon: signalIcon(L, "green"), zIndexOffset: -100 }).bindTooltip(`${s.name} · fixed-time cycle`).addTo(map),
    );
    return () => {
      signalMarkers.current.forEach((m) => m.remove());
      signalMarkers.current = [];
    };
  }, [ctx, filters.signals]);
  useEffect(() => {
    if (!ctx) return;
    signalMarkers.current.forEach((m, i) => m.setIcon(signalIcon(ctx.L, signalPhase(tick, SIGNAL_POINTS[i]!.phase))));
  }, [ctx, tick]);

  // Emergency units
  const unitMarkers = useRef(new Map<string, Leaflet.Marker>());
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const ms = unitMarkers.current;
    if (!filters.emergency) {
      ms.forEach((m) => m.remove());
      ms.clear();
      return;
    }
    units.forEach((u) => {
      const pos = unitPos(u);
      const html = `<div class="veh-emergency"><div class="popup-title"><span>${u.id}</span><span class="popup-chip">EMERGENCY</span></div><dl class="popup-grid"><dt>Type</dt><dd>${u.label}</dd><dt>Speed</dt><dd>${u.speed} km/h</dd><dt>Location</dt><dd>${unitLocation(u)}</dd><dt>Heading to</dt><dd>${unitDestination(u)}</dd><dt>Status</dt><dd>En route · verified</dd></dl></div>`;
      const m = ms.get(u.id);
      if (!m) {
        ms.set(u.id, L.marker(pos, { icon: emergencyIcon(L, u.kind), zIndexOffset: 1000 }).bindPopup(html).addTo(map));
      } else {
        m.setLatLng(pos);
        m.getPopup()?.setContent(html);
      }
    });
  }, [ctx, units, filters.emergency]);

  const activeUnits = units.length + (emergencyActive ? 1 : 0);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        eyebrow="Live command centre"
        title="Intelligent Roads. Safer Journeys."
        description="Sentinel Road watches every monitored vehicle, applies the right speed limit for each zone, flags violations for human review and clears the way for emergency vehicles."
        actions={
          <>
            <Button variant="glass" asChild>
              <Link to="/speed"><Gauge /> Speed monitoring</Link>
            </Button>
            <Button variant="emergency" asChild>
              <Link to="/emergency"><Siren /> Simulate emergency</Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="Vehicles monitored" value={monitored} icon={Car} delta="Today · 44 cameras + GPS" hint="Unique vehicles seen by ANPR cameras and GPS geofencing today (simulated)." />
        <StatCard label="Active speed violations" value={stats.violations} icon={AlertTriangle} tone="critical" delta={`${stats.warnings} vehicles on warning`} hint="Vehicles currently above their zone's limit for longer than the grace period." />
        <StatCard label="Verified violations" value={verifiedCount} icon={ShieldCheck} tone="safe" delta={`${pendingCount} awaiting review`} hint="Detections confirmed by an authorised officer. Only these can lead to a notice." />
        <StatCard label="Emergency vehicles" value={activeUnits} icon={Siren} tone="emergency" delta="Ambulance · Fire · Police" hint="Verified emergency units currently tracked by the system." />
        <StatCard label="Average speed" value={stats.avg} decimals={1} suffix="km/h" icon={Gauge} delta="Across all monitored roads" hint="Mean live speed of simulated vehicles on the map." />
        <StatCard
          label="Emergency response"
          text={emergencyActive ? "Coordinating" : "Ready"}
          tone={emergencyActive ? "emergency" : "safe"}
          icon={Activity}
          delta={emergencyActive ? "Signal priority engaged" : "Avg response 6.8 min"}
          hint="Status of emergency route and signal-priority coordination."
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <MapCanvas ref={mapRef} className="h-[520px] md:h-[600px]">
            <div className="absolute left-3 top-3 z-[600] flex flex-wrap items-center gap-2">
              <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
                <LiveDot tone="safe" /> Live traffic · Coimbatore
              </div>
              <Popover>
                <PopoverTrigger asChild>
                  <Button size="sm" variant="glass"><Layers /> Map filters</Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 border-glass-border bg-popover">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Show on map</p>
                  <div className="space-y-2.5">
                    {FILTERS.map((f) => (
                      <label key={f.key} className="flex cursor-pointer items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full", f.swatch)} />{f.label}</span>
                        <Switch checked={filters[f.key]} onCheckedChange={(c) => setFilters((s) => ({ ...s, [f.key]: c }))} />
                      </label>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
            <div className="glass absolute bottom-3 left-3 z-[600] hidden rounded-xl p-3 text-[11px] sm:block">
              <p className="mb-1.5 font-semibold uppercase tracking-wider text-muted-foreground">Legend</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-safe" />Normal</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-warning" />Speed warning</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-critical" />Violation</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full bg-emergency" />Emergency</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full border border-dashed border-warning" />School zone</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full border border-primary" />Residential</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full border border-safe" />Highway</span>
                <span className="flex items-center gap-2"><span className="h-1 w-3 rounded bg-critical/60" />Congestion</span>
                <span className="flex items-center gap-2"><span className="size-2.5 rounded-full border border-dashed border-muted-foreground bg-muted-foreground/60" />Outside city</span>
                <span className="flex items-center gap-2"><span className="h-0 w-3 border-t-2 border-dashed border-primary" />City geofence</span>
              </div>
            </div>
            <div className="glass absolute right-3 top-3 z-[600] hidden rounded-xl px-3 py-2 text-[11px] md:block">
              <span className="text-muted-foreground">Tip:</span> click any vehicle for live details
            </div>
          </MapCanvas>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <Panel
            title="Live violation alerts"
            subtitle="Raised automatically, verified by officers"
            icon={<AlertTriangle />}
            actions={<Badge variant="critical">{stats.violations} active</Badge>}
            bodyClassName="p-0"
          >
            <ul className="max-h-[290px] divide-y divide-border/60 overflow-y-auto">
              {feed.length === 0 && (
                <li className="flex items-center gap-3 px-4 py-6 text-sm text-muted-foreground">
                  <LiveDot /> Watching all zones for sustained speeding…
                </li>
              )}
              {feed.map((f) => (
                <li key={f.id} className="flex items-center gap-3 px-4 py-2.5 animate-float-up">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-critical/15 text-critical"><Gauge className="size-4" /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">{f.plate}</p>
                    <p className="truncate text-xs text-muted-foreground">{f.zone}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-critical tabular">{f.speed} km/h</p>
                    <p className="text-[11px] text-muted-foreground">limit {f.limit} · <TimeText ts={f.ts} /></p>
                  </div>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Emergency units" subtitle="Verified vehicles only" icon={<Siren />}>
            <div className="space-y-2">
              {units.map((u) => (
                <div key={u.id} className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/30 px-3 py-2">
                  <span className={cn("grid size-8 place-items-center rounded-lg", u.kind === "fire" ? "bg-critical/15 text-critical" : "bg-emergency/15 text-emergency")}>
                    {u.kind === "police" ? <ShieldCheck className="size-4" /> : u.kind === "fire" ? <AlertTriangle className="size-4" /> : <Siren className="size-4" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-semibold">{u.id}</p>
                    <p className="truncate text-xs text-muted-foreground">{unitLocation(u)}</p>
                  </div>
                  <Badge variant="emergency" className="max-w-[120px] truncate">→ {unitDestination(u)}</Badge>
                </div>
              ))}
            </div>
          </Panel>

          <Panel
            title="Coimbatore geofence"
            subtitle="Inside: local monitoring · Outside: external AI handoff (simulated)"
            icon={<MapPinned />}
            actions={<Badge variant="info">{stats.inside} in · {stats.outside} out</Badge>}
            bodyClassName="p-0"
          >
            <div className="grid grid-cols-3 gap-2 p-3 text-center text-xs">
              <div className="rounded-lg bg-background/40 p-2"><p className="text-muted-foreground">Entries</p><p className="font-display text-lg font-bold text-safe tabular">{geofence.entries}</p></div>
              <div className="rounded-lg bg-background/40 p-2"><p className="text-muted-foreground">Exits · handoffs</p><p className="font-display text-lg font-bold tabular">{geofence.exits}</p></div>
              <div className="rounded-lg bg-background/40 p-2"><p className="text-muted-foreground">Re-entries</p><p className="font-display text-lg font-bold text-primary tabular">{geofence.reentries}</p></div>
            </div>
            <ul className="max-h-[220px] divide-y divide-border/50 overflow-y-auto border-t border-border/50">
              {geofence.log.length === 0 && <li className="px-4 py-5 text-center text-xs text-muted-foreground">Watching the city boundary for vehicles entering and leaving…</li>}
              {geofence.log.slice(0, 12).map((e) => (
                <li key={e.id} className="flex items-start gap-3 px-4 py-2 text-xs animate-float-up">
                  <span className={cn("mt-0.5 grid size-6 shrink-0 place-items-center rounded-md", e.kind === "exit" ? "bg-muted text-muted-foreground" : e.kind === "reentry" ? "bg-primary/15 text-primary" : "bg-safe/15 text-safe")}>
                    {e.kind === "exit" ? <LogOut className="size-3.5" /> : e.kind === "reentry" ? <RefreshCw className="size-3.5" /> : <LogIn className="size-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p><span className="font-mono font-semibold">{e.plate}</span> {e.kind === "exit" ? "left the city" : e.kind === "reentry" ? "re-entered" : "entered"} <span className="text-muted-foreground">near {e.place}</span></p>
                    <p className="truncate text-muted-foreground">
                      {e.kind === "exit"
                        ? `Local monitoring off · history kept (${e.session?.warnings ?? 0} warnings, ${e.session?.violations ?? 0} violations) · sent to ${EXTERNAL_AI}`
                        : e.kind === "reentry"
                          ? `Local monitoring back on · ${e.priorSessions} earlier visit${e.priorSessions === 1 ? "" : "s"} on record`
                          : "Local monitoring switched on"}
                    </p>
                  </div>
                  <span className="text-[11px] text-muted-foreground"><TimeText ts={e.ts} /></span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {[
          { to: "/speed" as const, icon: Gauge, step: "01", title: "Detect speeding by zone", body: "GPS geofences know whether a vehicle is in a school, residential or highway zone and apply the right limit instantly.", cta: "Run speed simulation" },
          { to: "/violations" as const, icon: ScanLine, step: "02", title: "Verify before enforcing", body: "AI cameras read number plates and capture evidence. An authorised officer verifies every detection before any notice.", cta: "Try ANPR detection" },
          { to: "/emergency" as const, icon: TrafficCone, step: "03", title: "Clear the way", body: "Verified ambulances get a highlighted route, connected signal priority and give-way alerts to nearby drivers.", cta: "Simulate an emergency" },
        ].map((m) => (
          <Link key={m.to} to={m.to} className="glass group relative overflow-hidden rounded-2xl p-5 transition-all hover:-translate-y-0.5 hover:glow-primary">
            <div className="absolute -right-4 -top-6 font-display text-[88px] font-bold leading-none text-primary/5">{m.step}</div>
            <m.icon className="size-6 text-primary" />
            <h3 className="mt-3 text-base font-semibold">{m.title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{m.body}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-primary">
              {m.cta} <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
            </span>
          </Link>
        ))}
      </div>

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <CheckCircle2 className="size-3.5 text-safe" /> Demonstration prototype — all vehicles, cameras and signals are simulated. Map data © OpenStreetMap contributors.
      </p>
    </div>
  );
}
