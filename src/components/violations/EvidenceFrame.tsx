import frame1 from "@/assets/cam-feed-1.jpg";
import frame2 from "@/assets/cam-feed-2.jpg";
import { cn } from "@/lib/utils";

export const FRAMES: Record<1 | 2, string> = { 1: frame1, 2: frame2 };

type Box = [number, number, number, number];

export function BoundingBox({ box, label, tone = "critical", animate, className }: { box: Box; label?: string; tone?: "critical" | "safe" | "primary"; animate?: boolean; className?: string }) {
  const color = { critical: "border-critical text-critical", safe: "border-safe text-safe", primary: "border-primary text-primary" }[tone];
  const bg = { critical: "bg-critical text-critical-foreground", safe: "bg-safe text-safe-foreground", primary: "bg-primary text-primary-foreground" }[tone];
  return (
    <div
      className={cn("absolute border-2", color, animate && "animate-draw-box", className)}
      style={{ left: `${box[0]}%`, top: `${box[1]}%`, width: `${box[2]}%`, height: `${box[3]}%` }}
    >
      <span className="absolute -left-1 -top-1 size-3 border-l-2 border-t-2 border-current" />
      <span className="absolute -right-1 -top-1 size-3 border-r-2 border-t-2 border-current" />
      <span className="absolute -bottom-1 -left-1 size-3 border-b-2 border-l-2 border-current" />
      <span className="absolute -bottom-1 -right-1 size-3 border-b-2 border-r-2 border-current" />
      {label && (
        <span className={cn("absolute -top-5 left-0 whitespace-nowrap rounded px-1.5 py-0.5 font-mono text-[10px] font-bold", bg)}>{label}</span>
      )}
    </div>
  );
}

/** Zoomed crop of a region of a frame — used for the evidence previews. */
export function FrameCrop({ frame, box, className, pad = 0.15 }: { frame: 1 | 2; box: Box; className?: string; pad?: number }) {
  const [l, t, w, h] = box;
  const pw = w * (1 + pad * 2);
  const ph = h * (1 + pad * 2);
  const pl = Math.max(0, l - w * pad);
  const pt = Math.max(0, t - h * pad);
  const sx = 100 / pw;
  const sy = 100 / ph;
  return (
    <div className={cn("relative overflow-hidden bg-background", className)} style={{ aspectRatio: `${pw * 16} / ${ph * 9}` }}>
      <img
        src={FRAMES[frame]}
        alt="Evidence crop"
        className="absolute max-w-none"
        style={{ width: `${sx * 100}%`, height: `${sy * 100}%`, left: `${-pl * sx}%`, top: `${-pt * sy}%` }}
      />
    </div>
  );
}
