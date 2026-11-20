import { createFileRoute } from "@tanstack/react-router";
import { BellRing, Gauge, RotateCcw, Timer, UserCog } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, Panel } from "@/components/common/ui-bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { actions, useAppStore } from "@/lib/store";
import { DEFAULT_LIMITS, ZONE_LABEL, type ZoneType } from "@/lib/sim/speed-rules";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Sentinel Road" },
      { name: "description", content: "Configure zone speed limits, warning grace period, driver alerts and demo simulation speed." },
      { property: "og:title", content: "Settings — Sentinel Road" },
      { property: "og:description", content: "Configure the Sentinel Road demonstration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

const ZONES: ZoneType[] = ["school", "residential", "highway", "urban"];

function Settings() {
  const limits = useAppStore((s) => s.limits);
  const grace = useAppStore((s) => s.graceSeconds);
  const settings = useAppStore((s) => s.settings);
  const operator = useAppStore((s) => s.operator);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader eyebrow="Configuration" title="Settings" description="Changes apply instantly across the dashboard, speed monitoring and violation detection." />

      <Panel title="Zone speed limits" subtitle="Demonstration values (km/h)" icon={<Gauge />} actions={<Button size="sm" variant="ghost" onClick={() => { ZONES.forEach((z) => actions.setLimit(z, DEFAULT_LIMITS[z])); toast.success("Limits restored to defaults"); }}>Restore defaults</Button>}>
        <div className="grid gap-4 sm:grid-cols-2">
          {ZONES.map((z) => (
            <div key={z} className="space-y-2">
              <Label htmlFor={`limit-${z}`}>{ZONE_LABEL[z]}</Label>
              <div className="flex items-center gap-2">
                <Input
                  id={`limit-${z}`}
                  type="number"
                  min={10}
                  max={140}
                  value={limits[z]}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (Number.isFinite(v) && v >= 5 && v <= 150) actions.setLimit(z, v);
                  }}
                  className="bg-background/50"
                />
                <span className="text-sm text-muted-foreground">km/h</span>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Detection rules" icon={<Timer />}>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label>Warning grace period before a violation</Label>
            <span className="font-semibold tabular">{grace} s</span>
          </div>
          <Slider min={1} max={10} step={1} value={[grace]} onValueChange={([v]) => v !== undefined && actions.setGrace(v)} />
          <p className="text-xs text-muted-foreground">A vehicle over the limit gets a warning first; staying over for this long records a violation.</p>
        </div>
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <Label>Simulation speed</Label>
            <span className="font-semibold tabular">{settings.timeScale}× real time</span>
          </div>
          <Slider min={4} max={24} step={2} value={[settings.timeScale]} onValueChange={([v]) => v !== undefined && actions.setSetting("timeScale", v)} />
        </div>
      </Panel>

      <Panel title="Alerts" icon={<BellRing />}>
        <div className="space-y-4">
          {([
            ["driverAlerts", "In-vehicle driver warnings", "Show the speeding warning on the driver's screen."],
            ["toastAlerts", "Pop-up alerts in the control room", "Show a pop-up when a new violation is recorded."],
            ["autoCapture", "Automatic evidence capture", "Save the camera frame and plate crop with every detection."],
          ] as const).map(([k, label, desc]) => (
            <div key={k} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-muted-foreground">{desc}</p>
              </div>
              <Switch checked={settings[k]} onCheckedChange={(c) => actions.setSetting(k, c)} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Operator profile" subtitle="Name recorded on every review decision" icon={<UserCog />}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="operator">Reviewing officer</Label>
            <Input id="operator" value={operator} onChange={(e) => actions.setOperator(e.target.value)} className="bg-background/50" />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline"><RotateCcw /> Reset all demo data</Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="border-glass-border bg-popover">
              <AlertDialogHeader>
                <AlertDialogTitle>Reset the demonstration?</AlertDialogTitle>
                <AlertDialogDescription>This restores the sample violations, notifications, limits and settings.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => { actions.resetDemo(); toast.success("Demo data reset"); }}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </Panel>
    </div>
  );
}
