import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./ui-bits";

type Tone = "primary" | "safe" | "warning" | "critical" | "emergency";

const TONE: Record<Tone, { icon: string; bar: string; text: string }> = {
  primary: { icon: "bg-primary/12 text-primary", bar: "bg-primary", text: "text-foreground" },
  safe: { icon: "bg-safe/12 text-safe", bar: "bg-safe", text: "text-safe" },
  warning: { icon: "bg-warning/12 text-warning", bar: "bg-warning", text: "text-warning" },
  critical: { icon: "bg-critical/12 text-critical", bar: "bg-critical", text: "text-critical" },
  emergency: { icon: "bg-emergency/15 text-emergency", bar: "bg-emergency", text: "text-emergency" },
};

export function StatCard({
  label,
  value,
  suffix,
  decimals,
  text,
  icon: Icon,
  tone = "primary",
  delta,
  hint,
}: {
  label: string;
  value?: number;
  suffix?: string | undefined;
  decimals?: number | undefined;
  text?: string | undefined;
  icon: LucideIcon;
  tone?: Tone;
  delta?: string;
  hint: string;
}) {
  const t = TONE[tone];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="glass group relative overflow-hidden rounded-2xl p-4 transition-transform duration-300 hover:-translate-y-0.5">
          <div className={cn("absolute inset-x-0 top-0 h-px opacity-70", t.bar)} />
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <span className={cn("grid size-8 place-items-center rounded-lg", t.icon)}>
              <Icon className="size-4" />
            </span>
          </div>
          <div className="mt-3 flex items-baseline gap-1.5">
            {text ? (
              <span className={cn("font-display text-xl font-bold", t.text)}>{text}</span>
            ) : (
              <span className="font-display text-2xl font-bold md:text-[28px]">
                <AnimatedNumber value={value ?? 0} decimals={decimals} />
              </span>
            )}
            {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          </div>
          {delta && <p className="mt-1 text-xs text-muted-foreground">{delta}</p>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">{hint}</TooltipContent>
    </Tooltip>
  );
}
