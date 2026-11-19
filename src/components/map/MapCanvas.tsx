import { forwardRef, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Map container. `isolate` keeps Leaflet's high z-index panes beneath dialogs and the header. */
export const MapCanvas = forwardRef<HTMLDivElement, { className?: string; children?: ReactNode }>(
  function MapCanvas({ className, children }, ref) {
    return (
      <div className={cn("relative isolate overflow-hidden rounded-2xl border border-glass-border", className)}>
        <div ref={ref} className="sentinel-map absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 z-[500] shadow-[inset_0_0_80px_oklch(0.12_0.03_257/70%)]" />
        {children}
      </div>
    );
  },
);
