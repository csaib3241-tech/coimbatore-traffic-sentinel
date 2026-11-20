import { useEffect, useState } from "react";
import { Ban, CheckCircle2, FileCheck2, MapPin, Radar, ShieldAlert, ShieldCheck, Satellite } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { TimeText } from "@/components/common/ui-bits";
import { BoundingBox, FRAMES, FrameCrop } from "./EvidenceFrame";
import { actions, useAppStore } from "@/lib/store";
import { STATUS_LABEL, type ViolationRecord } from "@/lib/violations";
import { ZONE_LABEL } from "@/lib/sim/speed-rules";

export const STATUS_VARIANT = { pending: "warning", verified: "safe", rejected: "muted" } as const;

export function ReviewDialog({ recordId, onOpenChange }: { recordId: string | null; onOpenChange: (open: boolean) => void }) {
  const record = useAppStore((s) => s.violations.find((v) => v.id === recordId) ?? null);
  const operator = useAppStore((s) => s.operator);
  const [note, setNote] = useState("");
  useEffect(() => setNote(""), [recordId]);

  const decide = (r: ViolationRecord, decision: "verify" | "reject") => {
    if (!actions.review(r.id, decision, note.trim() || undefined)) {
      toast.error("Add the reviewing officer's name in Settings before reviewing.");
      return;
    }
    if (decision === "verify") {
      toast.success(`Violation verified · ${r.plate}`, { description: "Demo e-notice generated after officer verification." });
      actions.notify({ title: "Violation verified", body: `${r.plate} — ${r.type} confirmed by ${operator}.`, level: "success" });
    } else {
      toast(`Detection rejected · ${r.plate}`, { description: "Marked as incorrect — no notice will be issued." });
    }
  };

  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto border-glass-border bg-popover">
        {record && (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="font-mono text-xl">{record.plate}</DialogTitle>
                <Badge variant={STATUS_VARIANT[record.status]}>{STATUS_LABEL[record.status]}</Badge>
                <Badge variant="info">{record.source}</Badge>
              </div>
              <DialogDescription>
                {record.id} · {record.type} · detected <TimeText ts={record.ts} mode="full" />
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 md:grid-cols-5">
              <div className="md:col-span-3">
                {record.evidence ? (
                  <div className="space-y-2">
                    <div className="relative overflow-hidden rounded-xl border border-border">
                      <img src={FRAMES[record.evidence.frame]} alt={`Camera evidence for ${record.plate}`} className="block w-full" />
                      <BoundingBox box={record.evidence.vehicleBox} label={`${record.vehicleCategory.toUpperCase()} · ${record.speed} km/h`} />
                      <BoundingBox box={record.evidence.plateBox} tone="primary" />
                      <span className="absolute left-2 top-2 rounded bg-background/80 px-2 py-0.5 font-mono text-[10px]">{record.camera}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <FrameCrop frame={record.evidence.frame} box={record.evidence.vehicleBox} className="rounded-lg border border-border" />
                      <div className="space-y-2">
                        <FrameCrop frame={record.evidence.frame} box={record.evidence.plateBox} pad={0.4} className="rounded-lg border border-primary/40" />
                        <div className="rounded-lg border border-border bg-background/50 p-2 text-center">
                          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">OCR result</p>
                          <p className="font-mono text-lg font-bold tracking-wider">{record.plate}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid-bg flex h-full min-h-[240px] flex-col justify-between rounded-xl border border-border bg-background/40 p-4">
                    <div className="flex items-center gap-2 text-sm font-semibold"><Satellite className="size-4 text-primary" /> GPS geofence evidence</div>
                    <div className="space-y-2 font-mono text-xs">
                      <p>Zone: {ZONE_LABEL[record.zoneType]} ({record.limit} km/h)</p>
                      <p>Sustained speed: {record.speed} km/h for &gt; grace period</p>
                      <p>Trace samples: 12 @ 1 Hz · HDOP 0.8</p>
                      <p>Device: in-vehicle telematics (simulated)</p>
                    </div>
                    <div className="flex h-12 items-end gap-1">
                      {Array.from({ length: 24 }, (_, i) => {
                        const v = record.limit * 0.7 + (record.speed - record.limit * 0.7) * Math.min(1, i / 10);
                        return <span key={i} className={v > record.limit ? "flex-1 rounded-sm bg-critical/70" : "flex-1 rounded-sm bg-safe/60"} style={{ height: `${(v / (record.speed * 1.1)) * 100}%` }} />;
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3 md:col-span-2">
                <div className="rounded-xl border border-border bg-background/40 p-3 text-sm">
                  <Row icon={<Radar />} label="Detected speed" value={<span className="text-critical">{record.speed} km/h</span>} />
                  <Row icon={<ShieldAlert />} label="Applicable limit" value={`${record.limit} km/h`} />
                  <Row label="Excess" value={`+${record.speed - record.limit} km/h (${Math.round(((record.speed - record.limit) / record.limit) * 100)}%)`} />
                  <Row label="Vehicle" value={record.vehicleCategory} />
                  <Row label="AI confidence" value={<span className={record.confidence < 0.8 ? "text-warning" : "text-safe"}>{Math.round(record.confidence * 100)}%</span>} />
                  <Row icon={<MapPin />} label="Location" value={record.location} />
                </div>

                {record.status === "pending" ? (
                  <div className="space-y-2 rounded-xl border border-warning/40 bg-warning/5 p-3">
                    <p className="flex items-center gap-2 text-xs font-semibold text-warning"><ShieldCheck className="size-3.5" /> Officer verification required</p>
                    <p className="text-xs text-muted-foreground">No notice is issued until an authorised officer confirms this evidence. Reviewing as <b className="text-foreground">{operator}</b>.</p>
                    <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Review note (optional)" className="min-h-16 bg-background/50 text-sm" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button variant="safe" onClick={() => decide(record, "verify")}><CheckCircle2 /> Verify</Button>
                      <Button variant="outline" onClick={() => decide(record, "reject")}><Ban /> Reject</Button>
                    </div>
                  </div>
                ) : (
                  <div className={record.status === "verified" ? "rounded-xl border border-safe/40 bg-safe/5 p-3 text-sm" : "rounded-xl border border-border bg-muted/40 p-3 text-sm"}>
                    <p className="flex items-center gap-2 font-semibold">
                      {record.status === "verified" ? <FileCheck2 className="size-4 text-safe" /> : <Ban className="size-4 text-muted-foreground" />}
                      {record.status === "verified" ? "Verified — demo e-notice issued" : "Rejected — no action taken"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      By {record.reviewedBy} {record.reviewedAt && <>· <TimeText ts={record.reviewedAt} mode="full" /></>}
                    </p>
                    {record.noticeId && <p className="mt-2 font-mono text-xs">Reference: {record.noticeId} (demonstration only)</p>}
                    {record.reviewNote && <p className="mt-2 text-xs italic text-muted-foreground">“{record.reviewNote}”</p>}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ icon, label, value }: { icon?: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="flex items-center gap-1.5 text-muted-foreground [&_svg]:size-3.5">{icon}{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
