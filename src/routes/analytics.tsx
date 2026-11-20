import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Activity, AlertTriangle, BarChart3, BookOpen, Car, Download, Gauge, PieChart as PieIcon, ShieldCheck, Siren, Skull } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel, AnimatedNumber } from "@/components/common/ui-bits";
import { StatCard } from "@/components/common/StatCard";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { buildAnalytics, INDIA_2024, RANGE_LABEL, type Range, type ZoneFilter } from "@/lib/analytics-data";

export const Route = createFileRoute("/analytics")({
  head: () => ({
    meta: [
      { title: "Analytics & Reports — Sentinel Road" },
      { name: "description", content: "Traffic volume, speed violation trends, zone-wise violations, emergency response performance and accident statistics." },
      { property: "og:title", content: "Road Safety Analytics — Sentinel Road" },
      { property: "og:description", content: "Interactive road-safety analytics with date-range and zone filters." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Analytics,
});

const AXIS = { stroke: "var(--muted-foreground)", fontSize: 11, tickLine: false, axisLine: false } as const;
const GRID = { stroke: "var(--border)", strokeDasharray: "3 4", vertical: false } as const;
const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const ZONE_COLORS: Record<string, string> = { school: "var(--warning)", residential: "var(--primary)", highway: "var(--safe)", urban: "var(--chart-2)" };

function ChartTooltip({ active, payload, label, unit }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-glass-border bg-popover/95 px-3 py-2 text-xs shadow-xl backdrop-blur">
      {label && <p className="mb-1 font-semibold">{label}</p>}
      {payload.map((p) => (
        <p key={p.name} className="flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}</span>
          <span className="ml-auto font-semibold tabular">{p.value.toLocaleString("en-IN")}{unit ?? ""}</span>
        </p>
      ))}
    </div>
  );
}

function Analytics() {
  const [range, setRange] = useState<Range>("7d");
  const [zone, setZone] = useState<ZoneFilter>("all");
  const data = useMemo(() => buildAnalytics(range, zone), [range, zone]);
  const [activeZone, setActiveZone] = useState<string | null>(null);

  const exportCsv = () => {
    const rows = [["Period", "Vehicles", "Speed violations", "Verified"], ...data.traffic.map((t, i) => [t.label, t.vehicles, data.violations[i]?.speed ?? 0, data.violations[i]?.verified ?? 0])];
    const blob = new Blob([rows.map((r) => r.join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sentinel-road-report-${range}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    toast.success("Report exported", { description: `${RANGE_LABEL[range]} · ${zone === "all" ? "all zones" : `${zone} zones`}` });
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6">
      <PageHeader
        eyebrow="Module 4 · Analytics & reports"
        title="Analytics"
        description="Trends across traffic, violations, zones and emergency response. Filter by date range and zone type; hover any chart for details."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={range} onValueChange={(v) => setRange(v as Range)}>
              <TabsList className="bg-background/50">
                <TabsTrigger value="today">Today</TabsTrigger>
                <TabsTrigger value="7d">Last 7 Days</TabsTrigger>
                <TabsTrigger value="30d">Last 30 Days</TabsTrigger>
              </TabsList>
            </Tabs>
            <Select value={zone} onValueChange={(v) => setZone(v as ZoneFilter)}>
              <SelectTrigger className="h-9 w-40 bg-background/50"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All zones</SelectItem>
                <SelectItem value="school">School zones</SelectItem>
                <SelectItem value="residential">Residential</SelectItem>
                <SelectItem value="highway">Highway</SelectItem>
                <SelectItem value="urban">Urban roads</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="glass" onClick={exportCsv}><Download /> Export CSV</Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Traffic volume" value={data.kpis.totalVehicles} icon={Car} delta={RANGE_LABEL[range]} hint="Vehicle passes recorded across all monitored corridors." />
        <StatCard label="Speed violations" value={data.kpis.totalSpeed} icon={AlertTriangle} tone="critical" delta={zone === "all" ? "All zones" : `${zone} zones`} hint="Detections raised by GPS geofencing and ANPR cameras." />
        <StatCard label="Verification rate" value={data.kpis.verificationRate * 100} decimals={1} suffix="%" icon={ShieldCheck} tone="safe" delta={`${data.kpis.verifiedTotal.toLocaleString("en-IN")} confirmed by officers`} hint="Share of detections an authorised officer confirmed." />
        <StatCard label="Avg emergency response" value={data.kpis.avgWith} decimals={1} suffix="min" icon={Siren} tone="emergency" delta={`${Math.round(data.kpis.improvement * 100)}% faster with signal priority`} hint="Average time from dispatch to arrival with route priority." />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Panel title="Daily traffic volume" subtitle={range === "today" ? "Vehicles per hour" : "Vehicles per day"} icon={<Activity />} className="xl:col-span-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.traffic} margin={{ left: -10, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="gTraffic" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gTraffic2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...AXIS} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} />
                <ReTooltip content={<ChartTooltip />} />
                <Area type="monotone" dataKey="vehicles" name="All vehicles" stroke="var(--chart-1)" strokeWidth={2} fill="url(#gTraffic)" />
                <Area type="monotone" dataKey="twoWheelers" name="Two-wheelers" stroke="var(--chart-2)" strokeWidth={1.5} fill="url(#gTraffic2)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Vehicle categories" subtitle="Share of monitored traffic" icon={<PieIcon />}>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data.categories} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" paddingAngle={3} stroke="var(--background)" strokeWidth={2}>
                  {data.categories.map((_, i) => <Cell key={i} fill={PIE_COLORS[i]} />)}
                </Pie>
                <ReTooltip content={<ChartTooltip unit="%" />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Speed violation trends" subtitle="Detected vs officer-verified vs rejected" icon={<Gauge />} className="xl:col-span-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.violations} margin={{ left: -10, right: 8, top: 8 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} interval="preserveStartEnd" minTickGap={16} />
                <YAxis {...AXIS} />
                <ReTooltip content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="speed" name="Detected" stroke="var(--critical)" strokeWidth={2.2} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="verified" name="Verified" stroke="var(--safe)" strokeWidth={2} dot={false} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="rejected" name="Rejected" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Zone-wise violations" subtitle="Click a bar to highlight" icon={<BarChart3 />}>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.zones} layout="vertical" margin={{ left: 10, right: 16 }}>
                <CartesianGrid {...GRID} horizontal={false} vertical />
                <XAxis type="number" {...AXIS} />
                <YAxis type="category" dataKey="zone" {...AXIS} width={80} />
                <ReTooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<ChartTooltip />} />
                <Bar dataKey="violations" name="Violations" radius={[0, 6, 6, 0]} onClick={(d: { key?: string }) => setActiveZone((z) => (z === d.key ? null : d.key ?? null))}>
                  {data.zones.map((z) => (
                    <Cell key={z.key} cursor="pointer" fill={ZONE_COLORS[z.key]} fillOpacity={!activeZone || activeZone === z.key ? 0.9 : 0.25} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Emergency response performance" subtitle="Minutes from dispatch to arrival" icon={<Siren />} className="xl:col-span-2">
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.response} margin={{ left: -10, right: 8, top: 8 }} barGap={4}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} unit="m" />
                <ReTooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<ChartTooltip unit=" min" />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="without" name="Without priority" fill="var(--muted-foreground)" fillOpacity={0.45} radius={[6, 6, 0, 0]} />
                <Bar dataKey="with" name="With signal priority" fill="var(--emergency)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel title="Accident statistics" subtitle="Monitored corridors, by severity" icon={<AlertTriangle />}>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.accidents} margin={{ left: -20, right: 8, top: 8 }}>
                <CartesianGrid {...GRID} />
                <XAxis dataKey="label" {...AXIS} />
                <YAxis {...AXIS} allowDecimals={false} />
                <ReTooltip cursor={{ fill: "var(--accent)", opacity: 0.3 }} content={<ChartTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="minor" name="Minor" stackId="a" fill="var(--warning)" />
                <Bar dataKey="serious" name="Serious" stackId="a" fill="var(--chart-5)" />
                <Bar dataKey="fatal" name="Fatal" stackId="a" fill="var(--destructive)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <section className="glass relative overflow-hidden rounded-2xl p-5 md:p-6">
        <div className="grid-bg pointer-events-none absolute inset-0 opacity-50" />
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <BookOpen className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">India road safety — 2024 reference statistics</h2>
            <Badge variant="warning">Reference data · not live system data</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">National figures cited in the Sentinel Road project presentation, shown for context only.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            {[
              { label: "Total road accidents", value: INDIA_2024.accidents, icon: AlertTriangle, tone: "text-warning" },
              { label: "Total deaths", value: INDIA_2024.deaths, icon: Skull, tone: "text-critical" },
              { label: "Speeding-linked accidents", value: INDIA_2024.speeding, icon: Gauge, tone: "text-primary" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-border/60 bg-background/40 p-4">
                <s.icon className={`size-5 ${s.tone}`} />
                <p className="mt-3 font-display text-3xl font-bold"><AnimatedNumber value={s.value} /></p>
                <p className="text-sm text-muted-foreground">{s.label} (2024)</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm">
            Speeding is linked to roughly <b className="text-primary">{Math.round((INDIA_2024.speeding / INDIA_2024.accidents) * 100)}%</b> of 2024 road accidents — the problem Sentinel Road's geofenced speed regulation targets first.
          </p>
        </div>
      </section>
    </div>
  );
}
