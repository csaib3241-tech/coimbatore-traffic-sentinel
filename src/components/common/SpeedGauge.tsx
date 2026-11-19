import { cn } from "@/lib/utils";
import type { SpeedStatus } from "@/lib/sim/speed-rules";

const MAX = 140;
const toAngle = (v: number) => -120 + (Math.min(MAX, Math.max(0, v)) / MAX) * 240;

function arc(r: number, a0: number, a1: number) {
  const p = (a: number) => {
    const rad = ((a - 90) * Math.PI) / 180;
    return [100 + r * Math.cos(rad), 100 + r * Math.sin(rad)];
  };
  const [x0, y0] = p(a0);
  const [x1, y1] = p(a1);
  const large = a1 - a0 > 180 ? 1 : 0;
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

const STATUS_COLOR: Record<SpeedStatus, string> = {
  normal: "var(--safe)",
  warning: "var(--warning)",
  violation: "var(--critical)",
};

export function SpeedGauge({ speed, limit, status, className }: { speed: number; limit: number; status: SpeedStatus; className?: string }) {
  const color = STATUS_COLOR[status];
  const limitA = toAngle(limit);
  const lr = ((limitA - 90) * Math.PI) / 180;
  return (
    <svg viewBox="0 0 200 170" className={cn("w-full", className)} role="img" aria-label={`Speed ${speed} km/h, limit ${limit} km/h`}>
      <path d={arc(80, -120, 120)} stroke="var(--muted)" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d={arc(80, -120, limitA)} stroke="var(--safe)" strokeOpacity="0.25" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path d={arc(80, limitA, 120)} stroke="var(--critical)" strokeOpacity="0.22" strokeWidth="12" fill="none" strokeLinecap="round" />
      <path
        d={arc(80, -120, Math.max(-119.5, toAngle(speed)))}
        stroke={color}
        strokeWidth="12"
        fill="none"
        strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 6px ${color})`, transition: "all .45s ease" }}
      />
      {Array.from({ length: 15 }, (_, i) => {
        const a = ((toAngle(i * 10) - 90) * Math.PI) / 180;
        return (
          <line key={i} x1={100 + 64 * Math.cos(a)} y1={100 + 64 * Math.sin(a)} x2={100 + (i % 2 ? 68 : 70) * Math.cos(a)} y2={100 + (i % 2 ? 68 : 70) * Math.sin(a)} stroke="var(--muted-foreground)" strokeWidth={i % 2 ? 1 : 1.6} />
        );
      })}
      <line x1={100 + 70 * Math.cos(lr)} y1={100 + 70 * Math.sin(lr)} x2={100 + 94 * Math.cos(lr)} y2={100 + 94 * Math.sin(lr)} stroke="var(--foreground)" strokeWidth="2.5" />
      <text x={100 + 104 * Math.cos(lr)} y={100 + 104 * Math.sin(lr) + 3} textAnchor="middle" fontSize="9" fill="var(--foreground)" fontFamily="var(--font-mono)">{limit}</text>
      <text x="100" y="104" textAnchor="middle" fontSize="40" fontWeight="700" fill={color} fontFamily="var(--font-display)" style={{ transition: "fill .3s" }}>{speed}</text>
      <text x="100" y="122" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)" letterSpacing="2">KM/H</text>
      <text x="100" y="160" textAnchor="middle" fontSize="10" fill="var(--muted-foreground)">Limit {limit} km/h</text>
    </svg>
  );
}
