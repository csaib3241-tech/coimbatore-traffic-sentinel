import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Ban, Camera, Check, CheckCircle2, Circle, Eye, FileCheck2, Loader2, ScanLine, Search, ShieldCheck, Video } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, TimeText, LiveClock } from "@/components/common/ui-bits";
import { BoundingBox, FRAMES, FrameCrop } from "@/components/violations/EvidenceFrame";
import { ReviewDialog, STATUS_VARIANT } from "@/components/violations/ReviewDialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { actions, useAppStore } from "@/lib/store";
import { CAMERAS } from "@/lib/anpr";
import { STATUS_LABEL, type VerificationStatus, type ViolationRecord } from "@/lib/violations";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/violations")({
  validateSearch: (search: Record<string, unknown>): { q?: string } => ({
    q: typeof search.q === "string" && search.q ? search.q : undefined,
  }),
  head: () => ({
    meta: [
      { title: "AI Violation Detection & ANPR — Sentinel Road" },
      { name: "description", content: "Simulated AI camera detection, number-plate recognition and officer verification of traffic violations." },
      { property: "og:title", content: "AI Violation Detection & ANPR — Sentinel Road" },
      { property: "og:description", content: "Detect vehicles, read number plates, capture evidence and verify every violation by a human officer." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ViolationDetection,
});

const STEPS = [
  "Capture camera frame",
  "Detect vehicle (AI bounding box)",
  "Recognise number plate (ANPR)",
  "Measure vehicle speed",
  "Compare with applicable limit",
  "Generate violation record",
  "Save to history · Pending Review",
];
const STEP_MS = [600, 1000, 1300, 900, 700, 600, 450];

interface Detection {
  cam: number;
  speed: number;
  limit: number;
  recordId?: string;
}

function ViolationDetection() {
  const { q } = Route.useSearch();
  const navigate = useNavigate({ from: "/violations" });
  const limits = useAppStore((s) => s.limits);
  const violations = useAppStore((s) => s.violations);

  const [camIdx, setCamIdx] = useState(0);
  const [step, setStep] = useState(-1); // -1 idle, 0..6 running, 7 done
  const [det, setDet] = useState<Detection | null>(null);
  const [typed, setTyped] = useState("");
  const [reviewId, setReviewId] = useState<string | null>(null);
  const [status, setStatus] = useState<"all" | VerificationStatus>("all");
  const [source, setSource] = useState<"all" | "ANPR Camera" | "GPS Geofence">("all");
  const [query, setQuery] = useState(q ?? "");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => setQuery(q ?? ""), [q]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const cam = CAMERAS[det?.cam ?? camIdx];
  const running = step >= 0 && step < STEPS.length;

  const simulate = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const c = CAMERAS[camIdx];
    const speed = Math.round(c.speedRange[0] + Math.random() * (c.speedRange[1] - c.speedRange[0]));
    const limit = limits[c.zoneType];
    setDet({ cam: camIdx, speed, limit });
    setTyped("");
    setStep(0);
    let t = 0;
    STEP_MS.forEach((ms, i) => {
      t += ms;
      timers.current.push(
        setTimeout(() => {
          setStep(i + 1);
          if (i + 1 === 5) {
            const rec = actions.addViolation({
              plate: c.plate,
              type: "Over-speeding",
              vehicleCategory: c.category,
              speed,
              limit,
              zoneType: c.zoneType,
              location: c.location,
              source: "ANPR Camera",
              camera: c.camera,
              confidence: c.confidence,
              evidence: { frame: c.frame, vehicleBox: c.vehicleBox, plateBox: c.plateBox },
            });
            setDet((d) => (d ? { ...d, recordId: rec.id } : d));
          }
          if (i + 1 === STEPS.length) {
            toast.warning(`Violation detected · ${c.plate}`, { description: `${speed} km/h in a ${limit} km/h zone — awaiting officer review.` });
            actions.notify({ title: "New ANPR detection", body: `${c.plate} at ${speed} km/h (${c.camera}). Pending review.`, level: "warning" });
          }
        }, t),
      );
    });
    // plate typing effect during step 2
    const startType = STEP_MS[0] + STEP_MS[1];
    c.plate.split("").forEach((_, i) => {
      timers.current.push(setTimeout(() => setTyped(c.plate.slice(0, i + 1)), startType + 80 + i * 75));
    });
  };

  const nextCamera = () => {
    if (running) return;
    setDet(null);
    setStep(-1);
    setCamIdx((i) => (i + 1) % CAMERAS.length);
  };

  const filtered = useMemo(() => {
    const qq = query.trim().toLowerCase().replace(/\s+/g, "");
    return violations.filter(
      (v) =>
        (status === "all" || v.status === status) &&
        (source === "all" || v.source === source) &&
        (!qq || v.plate.toLowerCase().replace(/\s+/g, "").includes(qq) || v.location.toLowerCase().includes(query.trim().toLowerCase())),
    );
  }, [violations, status, source, query]);

  const counts = useMemo(
    () => ({
      all: violations.length,
      pending: violations.filter((v) => v.status === "pending").length,
      verified: violations.filter((v) => v.status === "verified").length,
      rejected: violations.filter((v) => v.status === "rejected").length,
    }),
    [violations],
  );

  const reviewed = violations.filter((v) => v.status !== "pending").sort((a, b) => (b.reviewedAt ?? 0) - (a.reviewedAt ?? 0)).slice(0, 5);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        eyebrow="Module 2 · AI violation detection & ANPR"
        title="Violation Detection"
        description="AI cameras spot each vehicle, read its number plate and measure its speed. Anything over the limit becomes a record with evidence — and stays “Pending Review” until an authorised officer verifies or rejects it."
        actions={
          <>
            <Button variant="glass" size="lg" onClick={nextCamera} disabled={running}><Video /> Switch camera</Button>
            <Button variant="hero" size="lg" onClick={simulate} disabled={running}>
              {running ? <Loader2 className="animate-spin" /> : <ScanLine />} {running ? "Detecting…" : "Simulate Detection"}
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-12">
        <div className="space-y-4 xl:col-span-8">
          <div className="glass overflow-hidden rounded-2xl">
            <div className="relative">
              <img src={FRAMES[cam.frame]} alt={`Live feed from ${cam.camera}`} className={cn("block w-full transition-all duration-500", step === -1 && "saturate-50 brightness-75")} />
              {/* HUD */}
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_50%,oklch(0_0_0/12%)_50%)] bg-[length:100%_4px]" />
              <div className="absolute left-3 top-3 flex items-center gap-2 rounded-lg bg-background/75 px-2.5 py-1 font-mono text-[11px] backdrop-blur">
                <span className="size-2 animate-pulse rounded-full bg-critical" /> REC · {cam.camera}
              </div>
              <div className="absolute right-3 top-3 rounded-lg bg-background/75 px-2.5 py-1 font-mono text-[11px] backdrop-blur">
                <LiveClock /> · LIMIT {limits[cam.zoneType]} km/h
              </div>
              {running && step <= 1 && (
                <div className="pointer-events-none absolute inset-x-0 top-0 h-[10%] bg-gradient-to-b from-transparent via-primary/30 to-transparent animate-scan" />
              )}
              {det && step >= 2 && cam.others.map((o) => <BoundingBox key={o.label} box={o.box} label={o.label} tone="safe" animate className="opacity-70" />)}
              {det && step >= 2 && (
                <BoundingBox box={cam.vehicleBox} label={`${cam.category.toUpperCase()} ${Math.round(cam.confidence * 100)}%${step >= 4 ? ` · ${det.speed} km/h` : ""}`} tone={step >= 5 ? "critical" : "primary"} animate />
              )}
              {det && step >= 2 && <BoundingBox box={cam.plateBox} tone="primary" animate />}
              {det && step >= 2 && (
                <div className="absolute bottom-3 left-3 rounded-xl border border-primary/50 bg-background/85 px-3 py-2 backdrop-blur animate-float-up">
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">ANPR · plate read</p>
                  <p className="font-mono text-xl font-bold tracking-widest text-primary">{typed}<span className="animate-blink">▍</span></p>
                </div>
              )}
              {det && step >= 4 && (
                <div className={cn("absolute bottom-3 right-3 rounded-xl border px-3 py-2 text-right backdrop-blur animate-float-up", step >= 5 ? "border-critical/60 bg-critical/20" : "border-border bg-background/85")}>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Radar speed</p>
                  <p className={cn("font-display text-2xl font-bold tabular", step >= 5 ? "text-critical" : "")}>{det.speed} <span className="text-xs font-normal">km/h</span></p>
                </div>
              )}
              {step === -1 && (
                <div className="absolute inset-0 grid place-items-center">
                  <Button variant="hero" size="lg" onClick={simulate}><ScanLine /> Simulate Detection</Button>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-glass-border px-4 py-2.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-2"><Camera className="size-3.5" /> {cam.location}</span>
              <span>Model: YOLO-style detector + OCR (simulated) · 25 fps</span>
            </div>
          </div>
        </div>

        <div className="space-y-6 xl:col-span-4">
          <Panel title="Detection workflow" subtitle="Each step of the AI pipeline" icon={<ScanLine />}>
            <ol className="space-y-1.5">
              {STEPS.map((s, i) => {
                const done = step > i;
                const active = step === i;
                return (
                  <li key={s} className={cn("flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors", active && "bg-primary/10", done && "text-foreground", !done && !active && "text-muted-foreground")}>
                    <span className={cn("grid size-6 shrink-0 place-items-center rounded-full border text-[10px]", done ? "border-safe bg-safe/15 text-safe" : active ? "border-primary text-primary" : "border-border")}>
                      {done ? <Check className="size-3.5" /> : active ? <Loader2 className="size-3.5 animate-spin" /> : <Circle className="size-2" />}
                    </span>
                    {s}
                  </li>
                );
              })}
            </ol>
          </Panel>

          {det && step >= 5 ? (
            <Panel title="Violation record" subtitle={det.recordId} icon={<FileCheck2 />} className="glow-critical animate-float-up">
              <div className="flex gap-3">
                <FrameCrop frame={cam.frame} box={cam.vehicleBox} className="w-28 shrink-0 rounded-lg border border-border" />
                <div className="min-w-0 flex-1 space-y-1 text-sm">
                  <p className="font-mono text-base font-bold">{cam.plate}</p>
                  <p><span className="text-critical font-semibold">{det.speed} km/h</span> <span className="text-muted-foreground">vs limit {det.limit}</span></p>
                  <Badge variant="critical">Over-speeding · +{det.speed - det.limit} km/h</Badge>
                  <p className="text-xs text-muted-foreground"><TimeText ts={Date.now()} mode="full" /></p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <FrameCrop frame={cam.frame} box={cam.plateBox} pad={0.4} className="rounded-lg border border-primary/40" />
                <Button variant="glass" className="h-auto" disabled={!det.recordId || step < STEPS.length} onClick={() => det.recordId && setReviewId(det.recordId)}>
                  <Eye /> Review evidence
                </Button>
              </div>
            </Panel>
          ) : (
            <Panel title="Evidence capture" subtitle="Appears once a violation is generated" icon={<Camera />}>
              <div className="grid h-36 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
                {running ? "Analysing frame…" : "Run a detection to capture evidence"}
              </div>
            </Panel>
          )}
        </div>
      </div>

      <Panel
        title="Violation management"
        subtitle="Every detection needs an authorised officer's decision before it counts"
        icon={<ShieldCheck />}
        bodyClassName="p-0"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  if (q) navigate({ search: { q: undefined } });
                }}
                placeholder="Search plate or location"
                className="h-8 w-52 rounded-lg border border-input bg-background/50 pl-8 pr-2 text-xs outline-none focus:border-primary/60"
              />
            </div>
            <Select value={source} onValueChange={(v) => setSource(v as typeof source)}>
              <SelectTrigger className="h-8 w-36 bg-background/50 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="ANPR Camera">ANPR Camera</SelectItem>
                <SelectItem value="GPS Geofence">GPS Geofence</SelectItem>
              </SelectContent>
            </Select>
          </div>
        }
      >
        <div className="border-b border-glass-border px-4 py-2">
          <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)}>
            <TabsList className="bg-background/40">
              <TabsTrigger value="all">All ({counts.all})</TabsTrigger>
              <TabsTrigger value="pending">Pending Review ({counts.pending})</TabsTrigger>
              <TabsTrigger value="verified">Verified ({counts.verified})</TabsTrigger>
              <TabsTrigger value="rejected">Rejected ({counts.rejected})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-2.5 font-medium">Registration</th>
                <th className="px-2 py-2.5 font-medium">Violation type</th>
                <th className="px-2 py-2.5 text-right font-medium">Detected</th>
                <th className="px-2 py-2.5 text-right font-medium">Limit</th>
                <th className="px-2 py-2.5 font-medium">Location</th>
                <th className="px-2 py-2.5 font-medium">Timestamp</th>
                <th className="px-2 py-2.5 font-medium">Verification</th>
                <th className="px-4 py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">No records match your filters.</td></tr>
              )}
              {filtered.map((v) => <ViolationRow key={v.id} v={v} onReview={() => setReviewId(v.id)} />)}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Review history" subtitle="Recent officer decisions" icon={<FileCheck2 />}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {reviewed.map((r) => (
            <button key={r.id} onClick={() => setReviewId(r.id)} className="rounded-xl border border-border/60 bg-background/30 p-3 text-left transition hover:border-primary/40">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{r.plate}</span>
                {r.status === "verified" ? <CheckCircle2 className="size-4 text-safe" /> : <Ban className="size-4 text-muted-foreground" />}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{STATUS_LABEL[r.status]} by {r.reviewedBy}</p>
              <p className="text-[11px] text-muted-foreground">{r.reviewedAt && <TimeText ts={r.reviewedAt} mode="relative" />}</p>
            </button>
          ))}
        </div>
      </Panel>

      <ReviewDialog recordId={reviewId} onOpenChange={(o) => !o && setReviewId(null)} />
    </div>
  );
}

function ViolationRow({ v, onReview }: { v: ViolationRecord; onReview: () => void }) {
  return (
    <tr className="border-t border-border/50 transition-colors hover:bg-accent/30">
      <td className="px-4 py-2.5">
        <span className="font-mono font-semibold">{v.plate}</span>
        <span className="block text-[11px] text-muted-foreground">{v.vehicleCategory} · {v.source}</span>
      </td>
      <td className="px-2 py-2.5">{v.type}</td>
      <td className="px-2 py-2.5 text-right font-semibold text-critical tabular">{v.speed} km/h</td>
      <td className="px-2 py-2.5 text-right tabular">{v.limit} km/h</td>
      <td className="max-w-[220px] truncate px-2 py-2.5 text-xs text-muted-foreground">{v.location}</td>
      <td className="px-2 py-2.5 text-xs"><TimeText ts={v.ts} mode="full" /></td>
      <td className="px-2 py-2.5">
        <Badge variant={STATUS_VARIANT[v.status]}>{STATUS_LABEL[v.status]}</Badge>
        {v.noticeId && <span className="mt-0.5 block font-mono text-[10px] text-safe">e-Notice {v.noticeId}</span>}
      </td>
      <td className="px-4 py-2.5">
        <div className="flex justify-end gap-1.5">
          <Button size="sm" variant="glass" onClick={onReview}><Eye /> Review</Button>
          {v.status === "pending" && (
            <>
              <Button size="sm" variant="safe" aria-label={`Verify ${v.plate}`} onClick={() => { actions.review(v.id, "verify"); toast.success(`Verified · ${v.plate}`); }}><Check /></Button>
              <Button size="sm" variant="outline" aria-label={`Reject ${v.plate}`} onClick={() => { actions.review(v.id, "reject"); toast(`Rejected · ${v.plate}`); }}><Ban /></Button>
            </>
          )}
        </div>
      </td>
    </tr>
  );
}
