import { cn } from "@/lib/utils";

export type LightState = "red" | "amber" | "green" | "priority";

export function TrafficLight({ state, className }: { state: LightState; className?: string }) {
  const on = (s: "red" | "amber" | "green") => state === s || (s === "green" && state === "priority");
  return (
    <div className={cn("flex w-7 flex-col items-center gap-1 rounded-lg border border-border bg-background/80 p-1", state === "priority" && "glow-emergency border-emergency/60", className)}>
      <span className={cn("size-4 rounded-full transition-all duration-300", on("red") ? "bg-critical shadow-[0_0_10px_var(--critical)]" : "bg-critical/15")} />
      <span className={cn("size-4 rounded-full transition-all duration-300", on("amber") ? "bg-warning shadow-[0_0_10px_var(--warning)]" : "bg-warning/15")} />
      <span className={cn("size-4 rounded-full transition-all duration-300", on("green") ? "bg-safe shadow-[0_0_10px_var(--safe)]" : "bg-safe/15", state === "priority" && "animate-pulse")} />
    </div>
  );
}
