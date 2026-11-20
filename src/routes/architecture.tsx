import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  BrainCircuit,
  Code2,
  Database,
  Eye,
  Map as MapIcon,
  MessageSquareShare,
  Radar,
  Satellite,
  ScanEye,
  Server,
  ShieldCheck,
  Siren,
  UserCheck,
  Workflow,
} from "lucide-react";
import { PageHeader, Panel } from "@/components/common/ui-bits";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/architecture")({
  head: () => ({
    meta: [
      { title: "System Architecture — Sentinel Road" },
      { name: "description", content: "How Sentinel Road works: sense the road, interpret events, verify actions and coordinate response." },
      { property: "og:title", content: "How Sentinel Road Works" },
      { property: "og:description", content: "Four-stage workflow and technology stack behind the smart road safety system." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Architecture,
});

const STAGES = [
  {
    n: 1,
    title: "Sense the road",
    icon: Radar,
    summary: "AI analytics, GPS mapping and OpenCV collect road-related information.",
    inputs: ["ANPR camera frames (OpenCV)", "In-vehicle GPS pings @ 1 Hz", "Geofence map of school, residential & highway zones", "Signal controller telemetry"],
    output: "Raw events streamed over MQTT",
    link: "/speed" as const,
  },
  {
    n: 2,
    title: "Interpret events",
    icon: BrainCircuit,
    summary: "The system correlates speed, trajectory and confidence to identify potential violations and hazards.",
    inputs: ["Zone lookup → applicable speed limit", "Speed vs limit over a grace window", "Plate OCR confidence scoring", "Trajectory & hazard correlation"],
    output: "Candidate violations with evidence",
    link: "/violations" as const,
  },
  {
    n: 3,
    title: "Verify actions",
    icon: UserCheck,
    summary: "Authorised personnel review and confirm detected evidence.",
    inputs: ["Evidence frame + plate crop", "Speed trace & zone context", "Verify or reject with notes", "Full audit trail of decisions"],
    output: "Only verified records lead to notices",
    link: "/violations" as const,
  },
  {
    n: 4,
    title: "Coordinate response",
    icon: Siren,
    summary: "The system provides driver alerts, emergency routing and traffic coordination.",
    inputs: ["In-vehicle speed warnings", "Emergency route planning", "Signal priority for verified vehicles", "Give-way alerts to nearby drivers"],
    output: "Safer roads, faster emergency response",
    link: "/emergency" as const,
  },
];

const STACK = [
  { name: "AI & Analytics", icon: BrainCircuit, desc: "Vehicle detection, OCR and event correlation models." },
  { name: "GPS & OpenStreetMap", icon: Satellite, desc: "Positioning, geofenced zones and road network data." },
  { name: "OpenCV", icon: ScanEye, desc: "Frame capture, preprocessing and plate localisation." },
  { name: "Python & FastAPI", icon: Server, desc: "Detection services and REST APIs for the control room." },
  { name: "React & Leaflet", icon: MapIcon, desc: "Command-centre interface and interactive maps." },
  { name: "PostgreSQL", icon: Database, desc: "Violation records, evidence metadata and audit logs." },
  { name: "MQTT Messaging", icon: MessageSquareShare, desc: "Low-latency events between cameras, vehicles and signals." },
];

function Connector({ active }: { active: boolean }) {
  return (
    <>
      <div className="relative hidden h-0.5 flex-1 self-center bg-border lg:block">
        <div className={cn("absolute inset-0 bg-gradient-primary transition-opacity", active ? "opacity-100" : "opacity-30")} />
        {[0, 0.7, 1.4].map((d) => (
          <span key={d} className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_8px_var(--primary)] flow-dot" style={{ animationDelay: `${d}s` }} />
        ))}
        <ArrowRight className="absolute -right-2 top-1/2 size-4 -translate-y-1/2 text-primary" />
      </div>
      <div className="relative mx-auto h-8 w-0.5 bg-border lg:hidden">
        <span className="absolute left-1/2 size-1.5 -translate-x-1/2 rounded-full bg-primary flow-dot-y" />
      </div>
    </>
  );
}

function Architecture() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setActive((a) => (a + 1) % STAGES.length), 2800);
    return () => clearInterval(t);
  }, [auto]);
  const stage = STAGES[active]!;

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        eyebrow="Module 5 · System architecture"
        title="How Sentinel Road works"
        description="Four stages turn raw road data into safer decisions — with a human officer in the loop before any enforcement action."
        actions={<Button variant="glass" onClick={() => setAuto((a) => !a)}><Workflow /> {auto ? "Pause animation" : "Play animation"}</Button>}
      />

      <section className="glass relative overflow-hidden rounded-2xl p-5 md:p-8">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-40" />
        <div className="relative flex flex-col items-stretch gap-0 lg:flex-row">
          {STAGES.map((s, i) => (
            <div key={s.n} className="contents">
              <button
                onClick={() => { setActive(i); setAuto(false); }}
                className={cn(
                  "group relative w-full rounded-2xl border p-5 text-left transition-all duration-500 lg:w-[22%]",
                  active === i ? "border-primary/60 bg-primary/10 glow-primary lg:-translate-y-1" : "border-border/60 bg-background/40 hover:border-primary/30",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className={cn("grid size-11 place-items-center rounded-xl transition-colors", active === i ? "bg-gradient-primary text-primary-foreground" : "bg-muted text-primary")}>
                    <s.icon className="size-5" />
                  </span>
                  <span className="font-display text-3xl font-bold text-primary/20">0{s.n}</span>
                </div>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Stage {s.n}</p>
                <h3 className="text-lg font-bold uppercase">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.summary}</p>
              </button>
              {i < STAGES.length - 1 && <Connector active={active > i} />}
            </div>
          ))}
        </div>

        <div key={active} className="relative mt-6 grid gap-4 rounded-2xl border border-border/60 bg-background/50 p-5 animate-in fade-in slide-in-from-bottom-2 duration-500 md:grid-cols-3">
          <div className="md:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stage {stage.n} in detail</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {stage.inputs.map((x) => (
                <li key={x} className="flex items-start gap-2 text-sm"><Eye className="mt-0.5 size-4 shrink-0 text-primary" /> {x}</li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col justify-between gap-3 rounded-xl bg-primary/5 p-4">
            <div>
              <p className="text-xs text-muted-foreground">Output</p>
              <p className="font-semibold">{stage.output}</p>
            </div>
            <Button variant="hero" asChild size="sm">
              <Link to={stage.link}>See it live <ArrowRight /></Link>
            </Button>
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Technology stack" subtitle="Reference implementation for a real deployment" icon={<Code2 />} className="lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {STACK.map((t, i) => (
              <div key={t.name} className="group rounded-xl border border-border/60 bg-background/30 p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 animate-float-up" style={{ animationDelay: `${i * 60}ms` }}>
                <t.icon className="size-6 text-primary transition-transform group-hover:scale-110" />
                <p className="mt-3 text-sm font-semibold">{t.name}</p>
                <p className="mt-1 text-xs text-muted-foreground">{t.desc}</p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="How the modules work together" icon={<ShieldCheck />}>
          <ol className="space-y-3 text-sm">
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-warning/15 text-xs font-bold text-warning">1</span><span><b>Speed monitoring</b> spots a vehicle over its zone limit and warns the driver.</span></li>
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-critical/15 text-xs font-bold text-critical">2</span><span>If speeding continues, <b>violation detection</b> captures plate and evidence — then an officer verifies it.</span></li>
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-emergency/15 text-xs font-bold text-emergency">3</span><span>When a crash happens, <b>emergency response</b> routes the nearest ambulance with signal priority.</span></li>
            <li className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary/15 text-xs font-bold text-primary">4</span><span><b>Analytics</b> feeds back which zones need lower limits, cameras or patrols.</span></li>
          </ol>
        </Panel>
      </div>
    </div>
  );
}
