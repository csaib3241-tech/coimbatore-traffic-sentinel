import { useEffect, useRef } from "react";
import type * as Leaflet from "leaflet";
import type { MapCtx } from "./useLeafletMap";
import { vehicleIcon, vehiclePopupHtml } from "./icons";
import type { SimVehicle } from "@/lib/sim/traffic";
import type { Zone } from "@/lib/sim/world";
import type { SpeedLimits } from "@/lib/sim/speed-rules";
import { CBE_GEOFENCE, GEOFENCE_NAME } from "@/lib/sim/geofence";

interface VehicleLayerOpts {
  visible?: (v: SimVehicle) => boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  showTags?: boolean | ((v: SimVehicle) => boolean);
  alerted?: Set<string>;
}

/** Keeps one Leaflet marker per simulated vehicle in sync with simulation state. */
export function useVehicleLayer(ctx: MapCtx | null, vehicles: SimVehicle[], opts: VehicleLayerOpts = {}) {
  const markers = useRef(new Map<string, { m: Leaflet.Marker; key: string }>());
  const onSelectRef = useRef(opts.onSelect);
  onSelectRef.current = opts.onSelect;

  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const seen = new Set<string>();
    for (const v of vehicles) {
      if (opts.visible && !opts.visible(v)) continue;
      seen.add(v.id);
      const selected = opts.selectedId === v.id;
      const alerted = opts.alerted?.has(v.id) ?? false;
      const external = v.geo.mode === "external";
      const tagOn = typeof opts.showTags === "function" ? opts.showTags(v) : !!opts.showTags;
      const tag = tagOn || selected ? v.plate : undefined;
      const key = `${v.status}|${selected}|${tag ?? ""}|${alerted}|${external}`;
      const existing = markers.current.get(v.id);
      if (!existing) {
        const m = L.marker(v.pos, { icon: vehicleIcon(L, v.status, { selected, tag, alerted, external }), riseOnHover: true })
          .bindPopup(vehiclePopupHtml(v), { closeButton: true, autoPan: false })
          .on("click", () => onSelectRef.current?.(v.id))
          .addTo(map);
        markers.current.set(v.id, { m, key });
      } else {
        existing.m.setLatLng(v.pos);
        if (existing.key !== key) {
          existing.m.setIcon(vehicleIcon(L, v.status, { selected, tag, alerted, external }));
          existing.key = key;
        }
        if (v.status !== "normal") existing.m.setZIndexOffset(v.status === "violation" ? 800 : 400);
        else existing.m.setZIndexOffset(selected ? 900 : 0);
        if (existing.m.isPopupOpen()) existing.m.setPopupContent(vehiclePopupHtml(v));
        else existing.m.getPopup()?.setContent(vehiclePopupHtml(v));
      }
    }
    for (const [id, { m }] of markers.current) {
      if (!seen.has(id)) {
        m.remove();
        markers.current.delete(id);
      }
    }
  });

  useEffect(() => {
    const ms = markers.current;
    return () => {
      ms.forEach(({ m }) => m.remove());
      ms.clear();
    };
  }, [ctx]);
}

export const ZONE_COLOR: Record<Zone["type"], string> = {
  school: "var(--warning)",
  residential: "var(--primary)",
  highway: "var(--safe)",
};

/** Draws geofenced speed zones as translucent circles with limit tooltips. */
export function useZoneLayer(
  ctx: MapCtx | null,
  zones: Zone[],
  limits: SpeedLimits,
  visible: (z: Zone) => boolean = () => true,
  highlightId?: string | null,
) {
  useEffect(() => {
    if (!ctx) return;
    const { L, map } = ctx;
    const group = L.layerGroup().addTo(map);
    for (const z of zones) {
      if (!visible(z)) continue;
      const hl = highlightId === z.id;
      L.circle(z.center, {
        radius: z.radius,
        color: ZONE_COLOR[z.type],
        weight: hl ? 2.5 : 1.2,
        dashArray: z.type === "school" ? "4 4" : undefined,
        fillColor: ZONE_COLOR[z.type],
        fillOpacity: hl ? 0.22 : 0.1,
      })
        .bindTooltip(`<b>${z.name}</b><br/>Limit ${limits[z.type]} km/h`, { sticky: true })
        .addTo(group);
      if (z.type === "school" && map.getZoom() >= 13) {
        L.tooltip({ permanent: true, direction: "center", className: "zone-label" })
          .setLatLng(z.center)
          .setContent(`${limits.school}`)
          .addTo(group);
      }
    }
    return () => {
      group.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, zones, limits, highlightId, visible]);
}

/** Draws the Coimbatore operational geofence. It is a monitoring boundary, not a movement limit. */
export function useGeofenceLayer(ctx: MapCtx | null, visible = true) {
  useEffect(() => {
    if (!ctx || !visible) return;
    const { L, map } = ctx;
    const poly = L.polygon(CBE_GEOFENCE, {
      color: "var(--primary)",
      weight: 2,
      dashArray: "10 6",
      fillColor: "var(--primary)",
      fillOpacity: 0.035,
      interactive: true,
    })
      .bindTooltip(`<b>${GEOFENCE_NAME}</b><br/>Inside: local monitoring · Outside: external AI handoff (simulated)`, { sticky: true })
      .addTo(map);
    poly.bringToBack();
    return () => {
      poly.remove();
    };
  }, [ctx, visible]);
}
