import { useEffect, useState, type RefObject } from "react";
import type * as Leaflet from "leaflet";
import type { LatLng } from "@/lib/sim/geo";

export type LeafletNS = typeof Leaflet;
export interface MapCtx {
  L: LeafletNS;
  map: Leaflet.Map;
}

/**
 * Creates a Leaflet map on the given element after hydration. Leaflet touches `window`
 * at import time, so it is imported dynamically inside the effect, never at module scope.
 */
export function useLeafletMap(
  ref: RefObject<HTMLDivElement | null>,
  opts: { center: LatLng; zoom: number; minZoom?: number },
): MapCtx | null {
  const [ctx, setCtx] = useState<MapCtx | null>(null);

  useEffect(() => {
    let map: Leaflet.Map | undefined;
    let cancelled = false;
    import("leaflet").then((mod) => {
      const L = ((mod as unknown as { default?: LeafletNS }).default ?? mod) as LeafletNS;
      if (cancelled || !ref.current) return;
      map = L.map(ref.current, {
        zoomControl: false,
        attributionControl: true,
        minZoom: opts.minZoom ?? 11,
        preferCanvas: false,
      }).setView(opts.center, opts.zoom);
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap contributors",
      }).addTo(map);
      setCtx({ L, map });
    });
    return () => {
      cancelled = true;
      map?.remove();
      setCtx(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep tiles correct when the container resizes (sidebar, responsive layout).
  useEffect(() => {
    if (!ctx || !ref.current) return;
    const ro = new ResizeObserver(() => ctx.map.invalidateSize());
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ctx, ref]);

  return ctx;
}
