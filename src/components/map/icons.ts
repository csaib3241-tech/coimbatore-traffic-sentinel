import type { LeafletNS } from "./useLeafletMap";
import type { SimVehicle } from "@/lib/sim/traffic";
import type { SpeedStatus } from "@/lib/sim/speed-rules";
import { ZONE_LABEL } from "@/lib/sim/speed-rules";

const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

export const SVG = {
  ambulance: svg('<path d="M10 10H6"/><path d="M8 8v4"/><path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.28a1 1 0 0 0-.684-.948l-1.923-.641a1 1 0 0 1-.578-.502l-1.539-3.076A1 1 0 0 0 16.382 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>'),
  fire: svg('<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>'),
  police: svg('<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>'),
  hospital: svg('<path d="M12 6v4"/><path d="M14 14h-4"/><path d="M14 18h-4"/><path d="M14 8h-4"/><path d="M18 12h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h2"/><path d="M18 22V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v18"/>'),
  alert: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  incident: svg('<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>'),
};

export function vehicleIcon(
  L: LeafletNS,
  status: SpeedStatus | "emergency",
  opts: { selected?: boolean; tag?: string; alerted?: boolean } = {},
) {
  const ring = status !== "normal" || opts.alerted ? '<span class="ring"></span>' : "";
  const tag = opts.tag ? `<span class="tag">${opts.tag}</span>` : "";
  const cls = opts.alerted ? "veh-warning" : `veh-${status}`;
  return L.divIcon({
    className: "veh-anim",
    html: `<div class="veh-marker ${cls} ${opts.selected ? "is-selected" : ""}">${ring}<span class="core"></span>${tag}</div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7],
  });
}

export type EmergencyKind = "ambulance" | "fire" | "police";

export function emergencyIcon(L: LeafletNS, kind: EmergencyKind, active = true) {
  const cls = kind === "fire" ? "em-fire" : kind === "police" ? "em-police" : "";
  return L.divIcon({
    className: "veh-anim",
    html: `<div class="em-marker ${cls}">${active ? '<span class="ring"></span>' : ""}${SVG[kind]}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

export function signalIcon(L: LeafletNS, state: "red" | "amber" | "green" | "priority") {
  return L.divIcon({
    className: "",
    html: `<div class="sig-marker sig-${state}"></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

export function pinIcon(L: LeafletNS, kind: "hospital" | "accident" | "incident") {
  const glyph = kind === "hospital" ? SVG.hospital : kind === "accident" ? SVG.alert : SVG.incident;
  return L.divIcon({
    className: "",
    html: `<div class="pin-marker pin-${kind}">${glyph}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

const STATUS_TEXT: Record<SpeedStatus, string> = {
  normal: "WITHIN LIMIT",
  warning: "SPEED WARNING",
  violation: "SPEED VIOLATION",
};

export function vehiclePopupHtml(v: SimVehicle) {
  return `<div class="veh-${v.status}">
    <div class="popup-title"><span>${v.plate}</span><span class="popup-chip">${STATUS_TEXT[v.status]}</span></div>
    <dl class="popup-grid">
      <dt>Current speed</dt><dd>${v.speed} km/h</dd>
      <dt>Speed limit</dt><dd>${v.limit} km/h</dd>
      <dt>Zone</dt><dd>${v.zoneType === "urban" ? ZONE_LABEL.urban : v.zoneName}</dd>
      <dt>Category</dt><dd>${v.category}</dd>
      <dt>Location</dt><dd>${v.location}</dd>
      <dt>Monitoring</dt><dd>GPS · Geofence active</dd>
    </dl>
  </div>`;
}
