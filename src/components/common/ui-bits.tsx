import { useEffect, useRef, useState, type ReactNode } from "react";
import { useHydrated } from "@tanstack/react-router";
import { format, formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";

export function Panel({
  title,
  subtitle,
  icon,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("glass rounded-2xl", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon && <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-4">{icon}</span>}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold">{title}</h3>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={cn("p-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
          <LiveDot /> {eyebrow}
        </div>
        <h1 className="text-2xl font-bold md:text-3xl">{title}</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function LiveDot({ className, tone = "primary" }: { className?: string; tone?: "primary" | "safe" | "critical" | "emergency" | "warning" }) {
  const color = {
    primary: "bg-primary",
    safe: "bg-safe",
    critical: "bg-critical",
    emergency: "bg-emergency",
    warning: "bg-warning",
  }[tone];
  return (
    <span className={cn("relative inline-flex size-2", className)}>
      <span className={cn("absolute inset-0 rounded-full animate-pulse-ring", color)} />
      <span className={cn("relative inline-flex size-2 rounded-full", color)} />
    </span>
  );
}

/** Counts smoothly toward `value` whenever it changes. */
export function AnimatedNumber({ value, decimals = 0, className }: { value: number; decimals?: number | undefined; className?: string | undefined }) {
  const [display, setDisplay] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = performance.now();
    const a = from.current;
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(a + (value - a) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      from.current = value;
    };
  }, [value]);
  return (
    <span className={cn("tabular", className)}>
      {display.toLocaleString("en-IN", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  );
}

/** Timestamps render only after hydration so server and browser clocks never disagree. */
export function TimeText({ ts, mode = "time" }: { ts: number; mode?: "time" | "relative" | "full" }) {
  const hydrated = useHydrated();
  if (!hydrated) return <span className="text-muted-foreground">—</span>;
  if (mode === "relative") return <span>{formatDistanceToNowStrict(ts, { addSuffix: true })}</span>;
  if (mode === "full") return <span className="tabular">{format(ts, "dd MMM yyyy, HH:mm:ss")}</span>;
  return <span className="tabular">{format(ts, "HH:mm:ss")}</span>;
}

export function LiveClock() {
  const hydrated = useHydrated();
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (!hydrated || !now) return <span className="tabular">--:--:--</span>;
  return <span className="tabular">{format(now, "HH:mm:ss")}</span>;
}

export function Stat({ label, value, tone }: { label: string; value: ReactNode; tone?: "critical" | "safe" | "warning" | "emergency" | "primary" | undefined }) {
  const color = tone ? { critical: "text-critical", safe: "text-safe", warning: "text-warning", emergency: "text-emergency", primary: "text-primary" }[tone] : "";
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("font-semibold tabular text-right", color)}>{value}</span>
    </div>
  );
}
