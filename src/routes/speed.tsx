import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertOctagon, Crosshair, Gauge, MapPin, Pause, Play, RotateCcw, Smartphone, Sliders, TriangleAlert, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, TimeText, LiveDot } from "@/components/common/ui-bits";
import { SpeedGauge } from "@/components/common/SpeedGauge";
import { MapCanvas } from "@/components/map/MapCanvas";
import { useLeafletMap } from "@/components/map/useLeafletMap";
import { useVehicleLayer, useZoneLayer } from "@/components/map/layers";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { actions, useAppStore } from "@/lib/store";
import { createVehicles, type SeedVehicle, type SimVehicle } from "@/lib/sim/traffic";
import { useTrafficSim } from "@/lib/sim/useTrafficSim";
import { driverWarningMessage, ZONE_LABEL, type SpeedLimits, type SpeedStatus } from "@/lib/sim/speed-rules";
import { CITY_CENTER, ZONES } from "@/lib/sim/world";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/speed")({
  head: () => ({
    meta: [
      { title: "Geofenced Speed Monitoring — Sentinel Road" },
      { name: "description", content: "Watch GPS geofencing apply school, residential and highway speed limits and flag speeding vehicles in real time." },
      { property: "og:title", content: "Geofenced Speed Regulation — Sentinel Road" },
      { property: "og:description", content: "Live simulation of zone-based speed limits, warnings and violation alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: SpeedMonitoring,
});

const FEATURED: SeedVehicle[] = [
  { plate: "TN 37 AB 1234", category: "Car", road: "crosscut", at: 0.24, dir: 1, cruise: 58, speeder: true },
  { plate: "TN 38 KM 2210", category: "Bus", road: "mettupalayam", at: 0.02, dir: 1, cruise: 46, speeder: true },
  { plate: "TN 66 RS 7781", category: "Two-wheeler", road: "sathy", at: 0.32, dir: 1, cruise: 56, speeder: true },
  { plate: "TN 99 HW 4502", category: "Car", road: "airport", at: 0.35, dir: 1, cruise: 97, speeder: true },
  { plate: "TN 37 CP 6619", category: "Truck", road: "trichy", at: 0.22, dir: 1, cruise: 45, speeder: false },
  { plate: "TN 38 LT 3090", category: "Car", road: "pollachi", at: 0.26, dir: 1, cruise: 52, speeder: false },
];

const STATUS_BADGE: Record<SpeedStatus, { label: string; variant: "safe" | "warning" | "critical" }> = {
  normal: { label: "Within limit", variant: "safe" },
  warning: { label: "Speed warning", variant: "warning" },
  violation: { label: "SPEED VIOLATION", variant: "critical" },
};

interface LogEvent {
  id: string;
  plate: string;
  level: "warning" | "violation";
  text: string;
  ts: number;
}

const makeFleet = (limits: SpeedLimits) => createVehicles(24, 4471, limits, FEATURED);

function SpeedMonitoring() {
  const limits = useAppStore((s) => s.limits);
  const graceSeconds = useAppStore((s) => s.graceSeconds);
  const settings = useAppStore((s) => s.settings);

  const [running, setRunning] = useState(false);
  const [started, setStarted] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("v0");
  const [follow, setFollow] = useState(true);
  const [log, setLog] = useState<LogEvent[]>([]);
  const logged = useRef(new Set<string>());
  const lastToast = useRef(0);

  const onTick = useCallback(
    (prev: SimVehicle[], next: SimVehicle[]) => {
      const events: LogEvent[] = [];
      next.forEach((v, i) => {
        const p = prev[i];
        if (!p) return;
        const zoneLabel = v.zoneType === "urban" ? ZONE_LABEL.urban : v.zoneName;
        if (v.status === "warning" && p.status === "normal") {
          events.push({ id: `${v.id}-w-${Date.now()}`, plate: v.plate, level: "warning", text: `${v.speed} km/h in ${zoneLabel} (limit ${v.limit}) — driver warned`, ts: Date.now() });
        }
        if (v.status === "violation" && p.status !== "violation") {
          events.push({ id: `${v.id}-v-${Date.now()}`, plate: v.plate, level: "violation", text: `Sustained ${v.speed} km/h in ${zoneLabel} (limit ${v.limit}) — violation recorded`, ts: Date.now() });
          const key = `${v.id}:${v.zoneId ?? v.zoneType}`;
          if (!logged.current.has(key)) {
            logged.current.add(key);
            actions.addViolation({
              plate: v.plate,
              type: v.zoneType === "urban" ? "Over-speeding" : `Over-speeding (${ZONE_LABEL[v.zoneType].replace(" Zone", "")} Zone)`,
              vehicleCategory: v.category,
              speed: v.speed,
              limit: v.limit,
              zoneType: v.zoneType,
              location: v.location,
              source: "GPS Geofence",
              confidence: 0.98,
            });
            if (v.zoneType === "school") {
              actions.notify({ title: "School zone violation", body: `${v.plate} at ${v.speed} km/h in ${v.zoneName} (${v.limit} km/h).`, level: "critical" });
            }
            const now = Date.now();
            if (settings.toastAlerts && now - lastToast.current > 3500) {
              lastToast.current = now;
              toast.error(`SPEED VIOLATION · ${v.plate}`, {
                description: `${v.speed} km/h in ${zoneLabel} — limit ${v.limit} km/h. Sent for officer review.`,
              });
            }
          }
        }
        if (v.status === "normal" && p.status !== "normal") {
          for (const k of logged.current) if (k.startsWith(`${v.id}:`)) logged.current.delete(k);
        }
      });
      if (events.length) setLog((l) => [...events, ...l].slice(0, 40));
    },
    [settings.toastAlerts],
  );

  const { vehicles, setVehicles } = useTrafficSim(() => makeFleet(limits), {
    running,
    limits,
    graceSeconds,
    timeScale: settings.timeScale,
    onTick,
  });

  const selected = vehicles.find((v) => v.id === selectedId) ?? vehicles[0];

  const mapRef = useRef<HTMLDivElement>(null);
  const ctx = useLeafletMap(mapRef, { center: CITY_CENTER, zoom: 13 });
  useVehicleLayer(ctx, vehicles, {
    selectedId,
    onSelect: setSelectedId,
    showTags: (v) => FEATURED.some((f) => f.plate === v.plate) || v.status === "violation",
  });
  const allZones = useCallback(() => true, []);
  useZoneLayer(ctx, ZONES, limits, allZones, selected?.zoneId);

  useEffect(() => {
    if (!ctx || !follow || !selected || !started) return;
    ctx.map.panTo(selected.pos, { animate: true, duration: 0.5 });
  }, [ctx, follow, selected?.pos, started, selected]);

  const start = () => {
    setRunning(true);
    if (!started && ctx && selected) ctx.map.setView(selected.pos, 15, { animate: true });
    setStarted(true);
    toast.success("Speed monitoring started", { description: "Geofences active — limits are applied per zone automatically." });
  };
  const reset = () => {
    setRunning(false);
    setStarted(false);
    setVehicles(makeFleet(limits));
    setLog([]);
    logged.current.clear();
    setSelectedId("v0");
    ctx?.map.setView(CITY_CENTER, 13);
  };

  const setManual = (speed: number | undefined) =>
    setVehicles((vs) => vs.map((v) => (v.id === selectedId ? { ...v, manualSpeed: speed } : v)));

  const counts = useMemo(
    () => ({
      warning: vehicles.filter((v) => v.status === "warning").length,
      violation: vehicles.filter((v) => v.status === "violation").length,
    }),
    [vehicles],
  );

  const tracked = useMemo(
    () => [...vehicles].sort((a, b) => {
      const rank = { violation: 0, warning: 1, normal: 2 } as const;
      return rank[a.status] - rank[b.status] || b.speed - a.speed;
    }),
    [vehicles],
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        eyebrow="Module 1 · Geofenced speed regulation"
        title="Speed Monitoring"
        description="GPS geofencing works out which zone each vehicle is in, applies that zone's limit and compares it with live speed. Over the limit triggers a driver warning; staying over it becomes a violation for officer review."
        actions={
          <>
            {!running ? (
              <Button variant="hero" size="lg" onClick={start}><Play /> {started ? "Resume monitoring" : "Start Speed Monitoring"}</Button>
            ) : (
              <Button variant="glass" size="lg" onClick={() => setRunning(false)}><Pause /> Pause</Button>
            )}
            <Button variant="glass" size="lg" onClick={reset}><RotateCcw /> Reset</Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <MapCanvas ref={mapRef} className="h-[480px] md:h-[560px]">
            <div className="absolute left-3 top-3 z-[600] flex flex-wrap gap-2">
              <div className="glass flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium">
                {running ? <><LiveDot tone="safe" /> Monitoring {vehicles.length} vehicles</> : <><span className="size-2 rounded-full bg-muted-foreground" /> {started ? "Paused" : "Ready — press Start"}</>}
              </div>
              <div className="glass flex items-center gap-3 rounded-xl px-3 py-2 text-xs">
                <span className="text-warning">{counts.warning} warnings</span>
                <span className="text-critical">{counts.violation} violations</span>
              </div>
            </div>
            <label className="glass absolute right-3 top-3 z-[600] flex cursor-pointer items-center gap-2 rounded-xl px-3 py-2 text-xs">
              <Crosshair className="size-3.5 text-primary" /> Follow selected
              <Switch checked={follow} onCheckedChange={setFollow} />
            </label>
            <div className="glass absolute bottom-3 left-3 z-[600] flex flex-wrap gap-3 rounded-xl px-3 py-2 text-[11px]">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-dashed border-warning bg-warning/20" /> School {limits.school}</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-primary bg-primary/20" /> Residential {limits.residential}</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full border border-safe bg-safe/20" /> Highway {limits.highway}</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-full bg-muted-foreground/40" /> Urban road {limits.urban}</span>
            </div>
          </MapCanvas>

          <Panel title="Zone speed limits" subtitle="Editable demonstration values — applied instantly to every vehicle" icon={<Sliders />}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(["school", "residential", "highway", "urban"] as const).map((z) => (
                <LimitControl key={z} zone={z} value={limits[z]} />
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-6 xl:col-span-4">
          {selected && (
            <Panel
              title={<span className="font-mono">{selected.plate}</span>}
              subtitle={`${selected.category} · tracked vehicle`}
              icon={<Gauge />}
              actions={<Badge variant={STATUS_BADGE[selected.status].variant}>{STATUS_BADGE[selected.status].label}</Badge>}
              className={cn(selected.status === "violation" && "glow-critical")}
            >
              <SpeedGauge speed={selected.speed} limit={selected.limit} status={selected.status} className="mx-auto max-w-[260px]" />
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-background/40 p-2.5">
                  <p className="text-muted-foreground">Zone</p>
                  <p className="mt-0.5 font-semibold">{selected.zoneType === "urban" ? ZONE_LABEL.urban : selected.zoneName}</p>
                </div>
                <div className="rounded-lg bg-background/40 p-2.5">
                  <p className="text-muted-foreground">Over limit for</p>
                  <p className="mt-0.5 font-semibold tabular">{selected.overSeconds.toFixed(1)} s <span className="font-normal text-muted-foreground">/ {graceSeconds}s grace</span></p>
                </div>
                <div className="col-span-2 flex items-start gap-2 rounded-lg bg-background/40 p-2.5">
                  <MapPin className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <p>{selected.location}</p>
                </div>
              </div>
              <div className="mt-4">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-medium">Adjust vehicle speed</span>
                  <span className="flex items-center gap-2">
                    <span className="tabular text-muted-foreground">{selected.manualSpeed !== undefined ? `${selected.manualSpeed} km/h (manual)` : "Auto driver"}</span>
                    {selected.manualSpeed !== undefined && (
                      <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => setManual(undefined)}><Wand2 className="size-3" /> Auto</Button>
                    )}
                  </span>
                </div>
                <Slider min={0} max={140} step={1} value={[selected.manualSpeed ?? selected.speed]} onValueChange={([v]) => v !== undefined && setManual(v)} />
                {!running && <p className="mt-2 text-[11px] text-muted-foreground">Start monitoring to see the vehicle respond.</p>}
              </div>
            </Panel>
          )}

          <DriverAlert vehicle={selected} enabled={settings.driverAlerts} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Tracked vehicles" subtitle="Click a row to select it on the map" icon={<Gauge />} bodyClassName="p-0">
          <div className="max-h-[360px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-popover/95 text-xs text-muted-foreground backdrop-blur">
                <tr className="text-left">
                  <th className="px-4 py-2 font-medium">Vehicle</th>
                  <th className="px-2 py-2 font-medium">Zone</th>
                  <th className="px-2 py-2 text-right font-medium">Speed / Limit</th>
                  <th className="px-4 py-2 text-right font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {tracked.map((v) => (
                  <tr key={v.id} onClick={() => setSelectedId(v.id)} className={cn("cursor-pointer border-t border-border/50 transition-colors hover:bg-accent/40", v.id === selectedId && "bg-primary/10")}>
                    <td className="px-4 py-2"><span className="font-mono font-semibold">{v.plate}</span><span className="block text-[11px] text-muted-foreground">{v.category}</span></td>
                    <td className="px-2 py-2 text-xs">{v.zoneType === "urban" ? ZONE_LABEL.urban : v.zoneName}</td>
                    <td className={cn("px-2 py-2 text-right tabular", v.status === "violation" ? "text-critical font-semibold" : v.status === "warning" ? "text-warning" : "")}>{v.speed} / {v.limit}</td>
                    <td className="px-4 py-2 text-right"><Badge variant={STATUS_BADGE[v.status].variant} className="text-[10px]">{STATUS_BADGE[v.status].label}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Detection event log" subtitle="Warnings and violations as they happen" icon={<TriangleAlert />} actions={log.length > 0 && <Button size="sm" variant="ghost" onClick={() => setLog([])}>Clear</Button>} bodyClassName="p-0">
          <ul className="max-h-[360px] divide-y divide-border/50 overflow-y-auto">
            {log.length === 0 && <li className="px-4 py-8 text-center text-sm text-muted-foreground">{running ? "Watching geofences…" : "Press “Start Speed Monitoring” to begin the simulation."}</li>}
            {log.map((e) => (
              <li key={e.id} className="flex gap-3 px-4 py-2.5 animate-float-up">
                <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", e.level === "violation" ? "bg-critical/15 text-critical" : "bg-warning/15 text-warning")}>
                  {e.level === "violation" ? <AlertOctagon className="size-4" /> : <TriangleAlert className="size-4" />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm"><span className="font-mono font-semibold">{e.plate}</span> <span className={e.level === "violation" ? "text-critical" : "text-warning"}>{e.level === "violation" ? "VIOLATION" : "WARNING"}</span></p>
                  <p className="text-xs text-muted-foreground">{e.text}</p>
                </div>
                <span className="text-[11px] text-muted-foreground"><TimeText ts={e.ts} /></span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

function LimitControl({ zone, value }: { zone: keyof SpeedLimits; value: number }) {
  const tone = { school: "text-warning", residential: "text-primary", highway: "text-safe", urban: "text-muted-foreground" }[zone];
  const RANGES: Record<keyof SpeedLimits, [number, number]> = { school: [10, 60], residential: [20, 70], highway: [50, 120], urban: [30, 80] };
  const range = RANGES[zone];
  return (
    <div className="rounded-xl border border-border/60 bg-background/30 p-3">
      <div className="flex items-center justify-between">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className={cn("text-xs font-semibold uppercase tracking-wider", tone)}>{ZONE_LABEL[zone]}</span>
          </TooltipTrigger>
          <TooltipContent>{zone === "urban" ? "Applies to roads outside any geofenced zone." : `Applies inside every ${ZONE_LABEL[zone].toLowerCase()} geofence.`}</TooltipContent>
        </Tooltip>
        <span className="font-display text-lg font-bold tabular">{value}<span className="ml-0.5 text-xs font-normal text-muted-foreground">km/h</span></span>
      </div>
      <Slider className="mt-3" min={range[0]} max={range[1]} step={5} value={[value]} onValueChange={([v]) => v !== undefined && actions.setLimit(zone, v)} />
    </div>
  );
}

function DriverAlert({ vehicle, enabled }: { vehicle?: SimVehicle | undefined; enabled: boolean }) {
  if (!vehicle) return null;
  const alerting = enabled && vehicle.status !== "normal";
  const critical = vehicle.status === "violation";
  return (
    <Panel title="Driver notification" subtitle="What the driver sees in-vehicle (simulated)" icon={<Smartphone />}>
      <div className={cn("relative overflow-hidden rounded-2xl border p-4 transition-all", critical && alerting ? "border-critical/60 bg-critical/12 glow-critical" : alerting ? "border-warning/50 bg-warning/10" : "border-border bg-background/40")}>
        <div className="mb-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Sentinel Drive · {vehicle.plate}</span>
          <span className="font-semibold">LIMIT {vehicle.limit}</span>
        </div>
        {alerting ? (
          <div className="flex gap-3">
            <span className={cn("grid size-11 shrink-0 place-items-center rounded-full", critical ? "bg-critical text-critical-foreground animate-pulse" : "bg-warning text-warning-foreground")}>
              <AlertOctagon className="size-6" />
            </span>
            <p className={cn("text-sm font-semibold leading-snug", critical ? "text-critical" : "text-warning")}>{driverWarningMessage(vehicle.zoneType)}</p>
          </div>
        ) : (
          <div className="flex gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-safe/15 text-safe"><Gauge className="size-6" /></span>
            <p className="text-sm text-muted-foreground">
              {enabled ? <>You are within the {vehicle.limit} km/h limit for this {vehicle.zoneType === "urban" ? "road" : "zone"}. Drive safely.</> : "Driver alerts are turned off in Settings."}
            </p>
          </div>
        )}
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">Tip: select <span className="font-mono">TN 37 AB 1234</span> and drag its speed to 58 km/h as it enters the Cross Cut school zone.</p>
    </Panel>
  );
}
