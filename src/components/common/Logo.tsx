import { cn } from "@/lib/utils";

export function Logo({ className, compact }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative grid size-9 place-items-center rounded-xl bg-gradient-primary glow-primary">
        <svg viewBox="0 0 32 32" className="size-5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M16 3 5 7.5v7.2c0 6.6 4.6 11.8 11 14.3 6.4-2.5 11-7.7 11-14.3V7.5z" />
          <path d="M16 9v4M16 17v2M16 23v1" />
        </svg>
      </div>
      {!compact && (
        <div className="leading-none">
          <div className="font-display text-[15px] font-bold tracking-[0.14em]">SENTINEL<span className="text-primary"> ROAD</span></div>
          <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Smart Road Safety</div>
        </div>
      )}
    </div>
  );
}
