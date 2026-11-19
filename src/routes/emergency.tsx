import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type * as Leaflet from "leaflet";
import {
  BellRing,
  CheckCircle2,
  Clock,
  Flag,
  Hospital as HospitalIcon,
  Loader2,
  Navigation,
  RotateCcw,
  Route as RouteIcon,
  ShieldCheck,
  Siren,
  TrafficCone,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { LiveDot, PageHeader, Panel, Stat, TimeText } from "@/components/common/ui-bits";
import { TrafficLight, type LightState } from "@/components/emergency/TrafficLight";
import { MapCanvas } from "@/components/map/MapCanvas";
import { useLeafletMap } from "@/components/map/useLeafletMap";
import { useVehicleLayer } from "@/components/map/layers";
import { emergencyIcon, pinIcon, signalIcon } from "@/components/map/icons";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actions, useAppStore } from "@/lib/store";
import { createVehicles } from "@/lib/sim/traffic";
import { useTrafficSim, TICK_MS } from "@/lib/sim/useTrafficSim";
import { haversine, pointAt, slicePolyline } from "@/lib/sim/geo";
import { HOSPITALS, INCIDENT, ROADS, nearestLandmark, signalPhase, type Hospital } from "@/lib/sim/world";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/emergency")({
  head: () => ({
    meta: [
      { title: "Emergency Response Coordination — Sentinel Road" },
      { name: "description", content: "Simulated ambulance routing with connected signal priority and give-way alerts to nearby drivers." },
      { property: "og:title", content: "Emergency Vehicle Coordination — Sentinel Road" },
      { property: "og:description", content: "Faster emergency response: highlighted routes, signal priority and nearby-driver alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: EmergencyResponse,
});

type Stage = "idle" | "routing" | "enroute" | "arrived";
type SignalMode = "normal" | "armed" | "preparing" | "priority" | "restored";

const AMB_ID = "AMB 001";
const SPEED_NORMAL = 34;
const SPEED_PRIORITY = 62;

const MODE_TEXT: Record<SignalMode, string> = {
  normal: "Normal cycle",
  armed: "Armed · awaiting approach",
  preparing: "Clearing junction",
  priority: "PRIORITY GREEN",
  restored: "Restored to normal",
};

function EmergencyResponse() {
  const timeScale = useAppStore((s) => s.settings.timeScale);
  const limits = useAppStore((s) => s.limits);
  const graceSeconds = useAppStore((s) => s.graceSeconds);
  const log = useAppStore((s) => s.emergencyLog);

  const [stage, setStage] = useState<Stage>("idle");
  const [hospitalId, setHospitalId] = useState<Hospital["id"]>("kmch");
  const [priority, setPriority] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [ambDist, setAmbDist] = useState(0);
  const [alerted, setAlerted] = useState<Set<string>>(() => new Set());
  const [alertFeed, setAlertFeed] = useState<{ id: string; plate: string; ts: number }[]>([]);
  const [startedAt, setStartedAt] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const hospital = HOSPITALS.find((h) => h.id === hospitalId)!;
  const route = hospital.route;
  const ambSpeed = priority ? SPEED_PRIORITY : SPEED_NORMAL;
  const remaining = Math.max(0, route.length - ambDist);
  const etaMin = remaining / (ambSpeed / 3.6) / 60;
  const etaNoPriority = route.length / (SPEED_NORMAL / 3.6) / 60;
  const etaWithPriority = route.length / (SPEED_PRIORITY / 3.6) / 60;
  const active = stage === "routing" || stage === "enroute";

  // Civilian traffic around the corridor
  const { vehicles, tick } = useTrafficSim(
    () => createVehicles(34, 909, limits, [], ["avinashi", "crosscut", "trichy", "mettupalayam", "sathy", "airport"]),
    { running: true, limits, graceSeconds, timeScale },
  );

  // Move the ambulance
  useEffect(() => {
    if (stage !== "enroute") return;
    setAmbDist((d) => {
      const nd = d + (ambSpeed / 3.6) * (TICK_MS / 1000) * timeScale;
      return Math.min(route.length, nd);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const ambPos = pointAt(route, ambDist);

  // Give-way alerts to nearby vehicles
  useEffect(() => {
    if (stage !== "enroute" || !priority) return;
    const fresh = vehicles.filter((v) => !alerted.has(v.id) && haversine(v.pos, ambPos) < 380);
    if (!fresh.length) return;
    setAlerted((s) => {
      const n = new Set(s);
      fresh.forEach((v) => n.add(v.id));
      return n;
    });
    setAlertFeed((f) => [...fresh.map((v) => ({ id: `${v.id}-${Date.now()}`, plate: v.plate, ts: Date.now() })), ...f].slice(0, 12));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  // Arrival
  const finish = useCallback(
    (reason: "arrived" | "completed") => {
      const minutes = startedAt ? ((Date.now() - startedAt) / 1000) * timeScale / 60 : etaWithPriority;
      setStage("arrived");
      actions.setEmergency(false);
      actions.logEmergency({ vehicle: AMB_ID, destination: hospital.short, minutes: Math.round(minutes * 10) / 10, priority });
      actions.notify({ title: `${AMB_ID} ${reason === "arrived" ? "arrived" : "completed"}`, body: `Patient handed over at ${hospital.name}. Signals restored to normal.`, level: "success" });
      toast.success(`${AMB_ID} ${reason === "arrived" ? "reached" : "completed run to"} ${hospital.short}`, { description: "Signal priority released — junctions back on normal cycle." });
    },
    [hospital, priority, startedAt, timeScale, etaWithPriority],
  );

  useEffect(() => {
    if (stage === "enroute" && ambDist >= route.length) finish("arrived");
  }, [ambDist, route.length, stage, finish]);

  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      actions.setEmergency(false);
    },
    [],
  );

  const signals = useMemo(
    () =>
      hospital.signals.map((s, i) => {
        const sd = s.at * route.length;
        const ahead = sd - ambDist;
        let mode: SignalMode = "normal";
        if (priority && stage === "enroute") {
          if (ahead < -40) mode = "restored";
          else if (ahead <= 900) mode = "priority";
          else if (ahead <= 1600) mode = "preparing";
          else mode = "armed";
        } else if (stage === "arrived" && priority) mode = "restored";
        const light: LightState =
          mode === "priority" ? "priority" : mode === "preparing" ? "amber" : signalPhase(tick, i * 3);
        return { ...s, pos: pointAt(route, sd), dist: sd, ahead, mode, light };
      }),
    [hospital, route, ambDist, priority, stage, tick],
  );

  /* ---------- Actions ---------- */
  const startSim = () => {
    timers.current.forEach(clearTimeout);
    setAmbDist(0);
    setPriority(false);
    setAlerted(new Set());
    setAlertFeed([]);
    setStage("routing");
    actions.setEmergency(true, `${AMB_ID} · Emergency active`);
    actions.notify({ title: "Emergency dispatched", body: `${AMB_ID} dispatched to ${INCIDENT.name}. Destination ${hospital.short}.`, level: "emergency" });
    toast(`🚑 ${AMB_ID} dispatched`, { description: `Calculating fastest route to ${hospital.name}…` });
    timers.current.push(
      setTimeout(() => {
        setStage("enroute");
        setStartedAt(Date.now());
        toast.info("Emergency route calculated", { description: `${(route.length / 1000).toFixed(1)} km · ${hospital.signals.length} signalised junctions on route.` });
      }, 1600),
    );
  };

  const activatePriority = () => {
    setVerifying(true);
    timers.current.push(
      setTimeout(() => {
        setVerifying(false);
        setPriority(true);
        actions.setEmergency(true, `${AMB_ID} · Signal priority active`);
        toast.success("Route priority activated", { description: `${AMB_ID} credentials verified. Junctions will turn green as it approaches.` });
      }, 1400),
    );
  };

  const reset = () => {
    timers.current.forEach(clearTimeout);
    setStage("idle");
    setPriority(false);
    setVerifying(false);
    setAmbDist(0);
    setAlerted(new Set());
    setAlertFeed([]);
    actions.setEmergency(false);
  };

  /* ---------- Map ---------- */
  const mapRef = useRef<HTMLDivElement>(null);
  const ctx = useLeafletMap(mapRef, { center: [11.022, 76.995], zoom: 13 });

  useVehicleLayer(ctx, vehicles, { alerted });

  // Hospitals + incident
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const g = L.layerGroup().addTo(map);
    HOSPITALS.forEach((h) =>
      L.marker(h.at, { icon: pinIcon(L, "hospital"), zIndexOffset: 500 })
        .bindTooltip(`${h.name}${h.id === hospitalId ? " · destination" : ""}`, { permanent: h.id === hospitalId && stage !== "idle", direction: "top", offset: [0, -14] })
        .addTo(g),
    );
    if (stage !== "idle") {
      L.marker(INCIDENT.at, { icon: pinIcon(L, "incident"), zIndexOffset: 600 }).bindTooltip(INCIDENT.name).addTo(g);
    }
    return () => {
      g.remove();
    };
  }, [ctx, hospitalId, stage]);

  // Route lines
  const routeLayers = useRef<{ base?: Leaflet.Polyline; done?: Leaflet.Polyline; flow?: Leaflet.Polyline }>({});
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const r = routeLayers.current;
    r.base?.remove();
    r.done?.remove();
    r.flow?.remove();
    routeLayers.current = {};
    if (stage === "idle" || stage === "routing") return;
    const base = L.polyline(route.pts, { color: "var(--emergency)", weight: 10, opacity: 0.25, lineCap: "round" }).addTo(map);
    const flow = L.polyline(route.pts, { color: priority ? "var(--primary)" : "var(--emergency)", weight: 4, opacity: 0.95, className: "route-flow" }).addTo(map);
    const done = L.polyline([], { color: "var(--muted-foreground)", weight: 5, opacity: 0.8 }).addTo(map);
    routeLayers.current = { base, flow, done };
    map.fitBounds(base.getBounds(), { padding: [50, 50], animate: true });
  }, [ctx, stage === "idle" || stage === "routing", route, priority]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    routeLayers.current.done?.setLatLngs(slicePolyline(route, 0, ambDist));
  }, [ambDist, route]);

  // Ambulance marker
  const ambMarker = useRef<Leaflet.Marker | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    if (stage === "idle") {
      ambMarker.current?.remove();
      ambMarker.current = null;
      return;
    }
    if (!ambMarker.current) {
      ambMarker.current = L.marker(ambPos, { icon: emergencyIcon(L, "ambulance"), zIndexOffset: 2000 })
        .bindTooltip(AMB_ID, { permanent: true, direction: "right", offset: [16, 0], className: "zone-label" })
        .addTo(map);
    } else ambMarker.current.setLatLng(ambPos);
  }, [ctx, stage, ambPos]);

  // Priority radius ring
  const ring = useRef<Leaflet.Circle | null>(null);
  useEffect(() => {
    if (!ctx) return;
    if (!(priority && stage === "enroute")) {
      ring.current?.remove();
      ring.current = null;
      return;
    }
    if (!ring.current) {
      ring.current = ctx.L.circle(ambPos, { radius: 380, color: "var(--emergency)", weight: 1.5, dashArray: "4 6", fillColor: "var(--emergency)", fillOpacity: 0.08 }).addTo(ctx.map);
    } else ring.current.setLatLng(ambPos);
  }, [ctx, priority, stage, ambPos]);

  // Signals on route
  const sigMarkers = useRef<Leaflet.Marker[]>([]);
  useEffect(() => {
    if (!ctx) return;
    sigMarkers.current.forEach((m) => m.remove());
    sigMarkers.current = [];
    if (stage === "idle" || stage === "routing") return;
    sigMarkers.current = signals.map((s) =>
      ctx.L.marker(s.pos, { icon: signalIcon(ctx.L, "green"), zIndexOffset: 700 }).bindTooltip(s.name).addTo(ctx.map),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, stage === "idle" || stage === "routing", hospitalId]);
  useEffect(() => {
    if (!ctx) return;
    sigMarkers.current.forEach((m, i) => {
      const s = signals[i];
      if (s) m.setIcon(signalIcon(ctx.L, s.light));
    });
  }, [ctx, signals]);

  // Other units moving on their roads
  const others = useMemo(() => {
    const t = tick * (TICK_MS / 1000) * timeScale;
    const fireD = (2600 + t * (44 / 3.6)) % ROADS.trichy.length;
    const pcrD = (900 + t * (38 / 3.6)) % ROADS.sathy.length;
    return [
      { id: "FIRE 02", kind: "fire" as const, type: "Fire engine", pos: pointAt(ROADS.trichy, fireD), destination: "Singanallur warehouse fire", status: "En route", eta: ((ROADS.trichy.length - fireD) / (44 / 3.6) / 60).toFixed(0) },
      { id: "PCR 07", kind: "police" as const, type: "Police patrol", pos: pointAt(ROADS.sathy, pcrD), destination: "Ganapathy patrol beat", status: "Patrolling", eta: "—" },
    ];
  }, [tick, timeScale]);
  const otherMarkers = useRef(new Map<string, Leaflet.Marker>());
  useEffect(() => {
    if (!ctx) return;
    others.forEach((o) => {
      const m = otherMarkers.current.get(o.id);
      if (!m) otherMarkers.current.set(o.id, ctx.L.marker(o.pos, { icon: emergencyIcon(ctx.L, o.kind, false), zIndexOffset: 900 }).bindTooltip(`${o.id} · ${o.type}`).addTo(ctx.map));
      else m.setLatLng(o.pos);
    });
  }, [ctx, others]);

  const etaLabel = stage === "arrived" ? "Arrived" : stage === "idle" ? "—" : `${String(Math.max(0, Math.round(etaMin))).padStart(2, "0")} Minutes`;
  const progress = route.length ? ambDist / route.length : 0;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        eyebrow="Module 3 · Emergency vehicle coordination"
        title="Emergency Response"
        description="When a verified ambulance is dispatched, Sentinel Road plots its route, gives it signal priority at each junction as it approaches and alerts nearby drivers to give way."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Select value={hospitalId} onValueChange={(v) => setHospitalId(v as Hospital["id"])} disabled={active}>
              <SelectTrigger className="h-10 w-[230px] bg-background/50"><HospitalIcon className="size-4 text-safe" /><SelectValue /></SelectTrigger>
              <SelectContent>
                {HOSPITALS.map((h) => <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button variant="emergency" size="lg" onClick={startSim} disabled={active}><Siren /> Simulate Emergency</Button>
          </div>
        }
      />

      <div className="glass flex flex-wrap items-center gap-2 rounded-2xl p-2">
        <Button variant="emergency" onClick={startSim} disabled={active}><Siren /> Start Emergency Simulation</Button>
        <Button variant="hero" onClick={activatePriority} disabled={stage !== "enroute" || priority || verifying}>
          {verifying ? <Loader2 className="animate-spin" /> : <Zap />} {priority ? "Route priority active" : verifying ? "Verifying vehicle…" : "Activate Route Priority"}
        </Button>
        <Button variant="safe" onClick={() => finish("completed")} disabled={stage !== "enroute"}><Flag /> Complete Emergency</Button>
        <Button variant="glass" onClick={reset}><RotateCcw /> Reset Simulation</Button>
        <span className="ml-auto hidden px-2 text-xs text-muted-foreground md:block">Demonstration only — priority is shown for simulated, verified emergency vehicles. No real signals are controlled.</span>
      </div>

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="xl:col-span-8">
          <MapCanvas ref={mapRef} className={cn("h-[500px] md:h-[600px] transition-shadow", priority && active && "glow-emergency")}>
            <div className="absolute left-3 top-3 z-[600] flex flex-wrap gap-2">
              {active ? (
                <div className="flex items-center gap-2 rounded-xl border border-emergency/60 bg-emergency/25 px-3 py-2 text-xs font-bold uppercase tracking-wider text-emergency-foreground backdrop-blur glow-emergency">
                  <Siren className="size-4 animate-pulse" /> {priority ? "Emergency coordination active" : stage === "routing" ? "Calculating route…" : "Ambulance en route"}
                </div>
              ) : (
                <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-xs"><LiveDot tone="safe" /> {stage === "arrived" ? "Run complete — signals normal" : "Standby — all signals normal"}</div>
              )}
            </div>
            {stage !== "idle" && (
              <div className="glass absolute bottom-3 left-3 right-3 z-[600] rounded-xl px-4 py-3 md:right-auto md:w-[360px]">
                <div className="mb-1.5 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{AMB_ID} → {hospital.short}</span>
                  <span className="font-semibold tabular">{(ambDist / 1000).toFixed(1)} / {(route.length / 1000).toFixed(1)} km</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className={cn("h-full rounded-full transition-all duration-500", priority ? "bg-gradient-primary" : "bg-emergency")} style={{ width: `${progress * 100}%` }} />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground">Near {nearestLandmark(ambPos)} · {ambSpeed} km/h {priority ? "(priority corridor)" : "(in traffic)"}</p>
              </div>
            )}
          </MapCanvas>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <section className={cn("rounded-2xl border p-4 transition-all", active ? "border-emergency/60 bg-emergency/10 glow-emergency" : stage === "arrived" ? "border-safe/50 bg-safe/5" : "glass")}>
            <div className="mb-3 flex items-center gap-2">
              <span className={cn("grid size-9 place-items-center rounded-lg", active ? "bg-emergency text-emergency-foreground" : "bg-muted text-muted-foreground")}>
                <Siren className={cn("size-5", active && "animate-pulse")} />
              </span>
              <div>
                <p className={cn("font-display text-sm font-bold uppercase tracking-wider", active ? "text-emergency" : stage === "arrived" ? "text-safe" : "text-muted-foreground")}>
                  {active ? "Emergency response activated" : stage === "arrived" ? "Emergency completed" : "No active emergency"}
                </p>
                <p className="text-[11px] text-muted-foreground">{stage === "idle" ? "Press “Simulate Emergency” to dispatch AMB 001" : INCIDENT.name}</p>
              </div>
            </div>
            <div className="divide-y divide-border/50">
              <Stat label="Vehicle" value={`Ambulance – ${AMB_ID}`} />
              <Stat label="Priority" value={stage === "idle" ? "—" : "HIGH"} tone={stage === "idle" ? undefined : "critical"} />
              <Stat label="Route" value={stage === "idle" ? "—" : stage === "routing" ? "Calculating…" : stage === "arrived" ? "Completed" : "Active"} tone={stage === "enroute" ? "safe" : undefined} />
              <Stat label="Signal coordination" value={priority ? (stage === "arrived" ? "Released" : "Enabled") : "Standby"} tone={priority && stage !== "arrived" ? "emergency" : undefined} />
              <Stat label="Nearby vehicle alerts" value={priority ? `Sent (${alerted.size})` : "Not sent"} tone={priority ? "safe" : undefined} />
              <Stat label="Estimated arrival" value={etaLabel} tone="primary" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
              <div className="rounded-lg bg-background/40 p-2">
                <p className="text-muted-foreground">Without priority</p>
                <p className="font-display text-lg font-bold tabular">{etaNoPriority.toFixed(0)} min</p>
              </div>
              <div className="rounded-lg bg-primary/10 p-2">
                <p className="text-muted-foreground">With priority</p>
                <p className="font-display text-lg font-bold text-primary tabular">{etaWithPriority.toFixed(0)} min</p>
              </div>
            </div>
            {verifying && (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-2 text-xs"><Loader2 className="size-3.5 animate-spin" /> Verifying {AMB_ID} credentials with district emergency control…</p>
            )}
            {priority && (
              <p className="mt-3 flex items-center gap-2 rounded-lg border border-safe/40 bg-safe/10 p-2 text-xs text-safe"><ShieldCheck className="size-3.5" /> Verified emergency vehicle · authorised for signal priority (simulated)</p>
            )}
          </section>

          <Panel title="Give-way alerts" subtitle="Sent to drivers within 380 m of the ambulance" icon={<BellRing />} bodyClassName="p-0">
            <ul className="max-h-[220px] divide-y divide-border/50 overflow-y-auto">
              {alertFeed.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted-foreground">{priority ? "Waiting for vehicles in range…" : "Alerts start once route priority is active."}</li>}
              {alertFeed.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-4 py-2 text-sm animate-float-up">
                  <BellRing className="size-4 text-warning" />
                  <span className="font-mono font-semibold">{a.plate}</span>
                  <span className="flex-1 truncate text-xs text-muted-foreground">“Ambulance approaching — please give way”</span>
                  <span className="text-[11px] text-muted-foreground"><TimeText ts={a.ts} /></span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>

      <Panel title="Connected signal priority" subtitle={`${hospital.signals.length} junctions on the route to ${hospital.short}`} icon={<TrafficCone />}>
        {stage === "idle" || stage === "routing" ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{stage === "routing" ? "Identifying traffic signals along the route…" : "Signals on the emergency route appear here once an emergency is simulated."}</p>
        ) : (
          <div className="relative">
            <div className="absolute left-6 right-6 top-[34px] hidden h-0.5 bg-border md:block" />
            <div className="absolute left-6 top-[34px] hidden h-0.5 bg-gradient-primary transition-all duration-500 md:block" style={{ width: `calc((100% - 3rem) * ${Math.min(1, progress)})` }} />
            <div className="grid gap-3 sm:grid-cols-2 md:grid-flow-col md:auto-cols-fr md:grid-cols-none">
              {signals.map((s) => (
                <div key={s.name} className={cn("relative rounded-xl border p-3 transition-all duration-300", s.mode === "priority" ? "border-emergency/60 bg-emergency/10 glow-emergency" : s.mode === "preparing" ? "border-warning/50 bg-warning/5" : "border-border/60 bg-background/30")}>
                  <div className="flex items-start gap-3">
                    <TrafficLight state={s.light} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{s.name}</p>
                      <p className={cn("text-[11px] font-semibold uppercase tracking-wider", s.mode === "priority" ? "text-emergency" : s.mode === "preparing" ? "text-warning" : s.mode === "restored" ? "text-safe" : "text-muted-foreground")}>{MODE_TEXT[s.mode]}</p>
                      <p className="mt-1 text-[11px] text-muted-foreground tabular">{s.ahead > 0 ? `${(s.ahead / 1000).toFixed(1)} km ahead` : "Passed"}</p>
                      {s.mode === "priority" && <p className="text-[10px] text-muted-foreground">Cross traffic held on red</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Emergency fleet" subtitle="Verified units tracked by Sentinel Road" icon={<Navigation />} bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Vehicle</th>
                  <th className="px-2 py-2 font-medium">Location</th>
                  <th className="px-2 py-2 font-medium">Destination</th>
                  <th className="px-2 py-2 font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">ETA</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-border/50">
                  <td className="px-4 py-2"><span className="font-mono font-semibold">{AMB_ID}</span><span className="block text-[11px] text-muted-foreground">Ambulance</span></td>
                  <td className="px-2 py-2 text-xs">{stage === "idle" ? "CMCH depot" : nearestLandmark(ambPos)}</td>
                  <td className="px-2 py-2 text-xs">{stage === "idle" ? "—" : hospital.short}</td>
                  <td className="px-2 py-2"><Badge variant={active ? "emergency" : stage === "arrived" ? "safe" : "muted"}>{active ? (priority ? "Priority run" : "En route") : stage === "arrived" ? "Arrived" : "Standby"}</Badge></td>
                  <td className="px-4 py-2 text-right tabular">{stage === "enroute" ? `${etaMin.toFixed(0)} min` : "—"}</td>
                </tr>
                <tr className="border-t border-border/50">
                  <td className="px-4 py-2"><span className="font-mono font-semibold">AMB 014</span><span className="block text-[11px] text-muted-foreground">Ambulance</span></td>
                  <td className="px-2 py-2 text-xs">Town Hall</td>
                  <td className="px-2 py-2 text-xs">—</td>
                  <td className="px-2 py-2"><Badge variant="muted">Standby</Badge></td>
                  <td className="px-4 py-2 text-right">—</td>
                </tr>
                {others.map((o) => (
                  <tr key={o.id} className="border-t border-border/50">
                    <td className="px-4 py-2"><span className="font-mono font-semibold">{o.id}</span><span className="block text-[11px] text-muted-foreground">{o.type}</span></td>
                    <td className="px-2 py-2 text-xs">{nearestLandmark(o.pos)}</td>
                    <td className="px-2 py-2 text-xs">{o.destination}</td>
                    <td className="px-2 py-2"><Badge variant={o.kind === "fire" ? "critical" : "info"}>{o.status}</Badge></td>
                    <td className="px-4 py-2 text-right tabular">{o.eta === "—" ? "—" : `${o.eta} min`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Response log" subtitle="Completed emergency runs" icon={<Clock />} bodyClassName="p-0">
          <ul className="divide-y divide-border/50">
            {log.slice(0, 6).map((e) => (
              <li key={e.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                <CheckCircle2 className="size-4 text-safe" />
                <span className="font-mono font-semibold">{e.vehicle}</span>
                <span className="flex-1 text-xs text-muted-foreground">→ {e.destination} · {e.priority ? "signal priority" : "no priority"}</span>
                <span className="font-semibold tabular">{e.minutes.toFixed(1)} min</span>
                <span className="w-20 text-right text-[11px] text-muted-foreground"><TimeText ts={e.ts} mode="relative" /></span>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 border-t border-border/50 px-4 py-2.5 text-xs text-muted-foreground">
            <RouteIcon className="size-3.5" /> Signal priority cuts average response time by ~40% in this simulation.
          </div>
        </Panel>
      </div>
    </div>
  );
}
