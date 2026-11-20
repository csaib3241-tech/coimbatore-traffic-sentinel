import { useSyncExternalStore } from "react";
import { DEFAULT_GRACE_SECONDS, DEFAULT_LIMITS, type SpeedLimits } from "./sim/speed-rules";
import { applyReview, type ReviewDecision, type ViolationRecord } from "./violations";

export type NoticeLevel = "info" | "warning" | "critical" | "emergency" | "success";

export interface Notice {
  id: string;
  title: string;
  body: string;
  level: NoticeLevel;
  ts: number;
  read: boolean;
}

export interface EmergencyLogEntry {
  id: string;
  vehicle: string;
  destination: string;
  minutes: number;
  priority: boolean;
  ts: number;
}

export interface AppSettings {
  driverAlerts: boolean;
  autoCapture: boolean;
  toastAlerts: boolean;
  timeScale: number;
}

export interface AppState {
  operator: string;
  limits: SpeedLimits;
  graceSeconds: number;
  settings: AppSettings;
  violations: ViolationRecord[];
  notifications: Notice[];
  emergencyActive: boolean;
  emergencyLabel: string | null;
  emergencyLog: EmergencyLogEntry[];
}

const MIN = 60_000;

function seedViolations(now: number): ViolationRecord[] {
  const rows: Omit<ViolationRecord, "id" | "ts">[] = [
    { plate: "TN 38 DX 7426", type: "Over-speeding", vehicleCategory: "Car", speed: 68, limit: 50, zoneType: "urban", location: "Avinashi Road, near Nava India", source: "ANPR Camera", camera: "CAM-07 · Avinashi Rd", confidence: 0.97, status: "pending", evidence: { frame: 1, vehicleBox: [42.8, 43.4, 18.4, 29.8], plateBox: [47.6, 66.2, 5.3, 2.9] } },
    { plate: "TN 37 AB 1234", type: "Over-speeding (School Zone)", vehicleCategory: "Car", speed: 58, limit: 30, zoneType: "school", location: "Cross Cut Road, near Gandhipuram", source: "GPS Geofence", confidence: 0.99, status: "pending" },
    { plate: "MH 12 UJ 7368", type: "Over-speeding", vehicleCategory: "SUV", speed: 112, limit: 80, zoneType: "highway", location: "Airport Expressway, near Airport Jn", source: "ANPR Camera", camera: "CAM-12 · Airport Expy", confidence: 0.95, status: "verified", reviewedBy: "Insp. R. Priya", evidence: { frame: 2, vehicleBox: [42.3, 39.1, 14.9, 28.1], plateBox: [46.7, 61, 4.5, 2.2] } },
    { plate: "TN 66 KR 4410", type: "Over-speeding (Residential)", vehicleCategory: "Two-wheeler", speed: 57, limit: 40, zoneType: "residential", location: "Sathy Road, near Ganapathy", source: "GPS Geofence", confidence: 0.98, status: "verified", reviewedBy: "SI M. Karthik" },
    { plate: "TN 99 PL 2087", type: "Over-speeding", vehicleCategory: "Truck", speed: 61, limit: 50, zoneType: "urban", location: "Trichy Road, near Singanallur", source: "ANPR Camera", camera: "CAM-03 · Trichy Rd", confidence: 0.71, status: "rejected", reviewedBy: "Insp. R. Priya", reviewNote: "Plate partially occluded — misread" },
    { plate: "TN 37 MZ 9921", type: "Over-speeding (School Zone)", vehicleCategory: "Bus", speed: 44, limit: 30, zoneType: "school", location: "Trichy Road, near Ramanathapuram", source: "GPS Geofence", confidence: 0.96, status: "pending" },
    { plate: "TN 38 CJ 5530", type: "Over-speeding", vehicleCategory: "Car", speed: 97, limit: 80, zoneType: "highway", location: "Mettupalayam Road, near Thudiyalur", source: "ANPR Camera", camera: "CAM-09 · NH-181", confidence: 0.93, status: "verified", reviewedBy: "SI M. Karthik" },
    { plate: "TN 37 HT 3318", type: "Over-speeding (Residential)", vehicleCategory: "Auto-rickshaw", speed: 49, limit: 40, zoneType: "residential", location: "Marudamalai Road, near RS Puram", source: "GPS Geofence", confidence: 0.94, status: "pending" },
  ];
  const ago = [4, 9, 22, 41, 63, 88, 131, 176];
  return rows.map((r, i) => {
    const ts = now - ago[i]! * MIN;
    const rec: ViolationRecord = { ...r, id: `VR-${String(240_410 + i)}`, ts };
    if (rec.status === "verified") {
      rec.reviewedAt = ts + 6 * MIN;
      rec.noticeId = `ECN-${String(240_410 + i).slice(-6)}`;
    }
    if (rec.status === "rejected") rec.reviewedAt = ts + 9 * MIN;
    return rec;
  });
}

function seedNotices(now: number): Notice[] {
  return [
    { id: "n1", title: "School zone violation", body: "TN 37 AB 1234 at 58 km/h in Cross Cut School Zone (30 km/h).", level: "critical", ts: now - 9 * MIN, read: false },
    { id: "n2", title: "Camera CAM-14 back online", body: "Sathy Road camera reconnected after 4 min maintenance.", level: "success", ts: now - 26 * MIN, read: false },
    { id: "n3", title: "Heavy congestion", body: "Cross Cut Road — average speed below 12 km/h.", level: "warning", ts: now - 38 * MIN, read: true },
  ];
}

function createInitialState(): AppState {
  const now = Date.now();
  return {
    operator: "Insp. R. Priya",
    limits: { ...DEFAULT_LIMITS },
    graceSeconds: DEFAULT_GRACE_SECONDS,
    settings: { driverAlerts: true, autoCapture: true, toastAlerts: true, timeScale: 12 },
    violations: seedViolations(now),
    notifications: seedNotices(now),
    emergencyActive: false,
    emergencyLabel: null,
    emergencyLog: [
      { id: "e1", vehicle: "AMB 006", destination: "KMCH", minutes: 7.2, priority: true, ts: now - 140 * MIN },
      { id: "e2", vehicle: "FIRE 02", destination: "Singanallur", minutes: 9.4, priority: true, ts: now - 300 * MIN },
      { id: "e3", vehicle: "AMB 011", destination: "CMCH", minutes: 12.8, priority: false, ts: now - 420 * MIN },
    ],
  };
}

let state: AppState | null = null;
const listeners = new Set<() => void>();

function get(): AppState {
  if (!state) state = createInitialState();
  return state;
}

function set(updater: (s: AppState) => AppState) {
  state = updater(get());
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useAppStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(
    subscribe,
    () => selector(get()),
    () => selector(get()),
  );
}

let counter = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export const actions = {
  getState: get,
  addViolation(v: Omit<ViolationRecord, "id" | "ts" | "status">): ViolationRecord {
    const rec: ViolationRecord = {
      ...v,
      id: `VR-${String(240_500 + counter++)}`,
      ts: Date.now(),
      status: "pending",
    };
    set((s) => ({ ...s, violations: [rec, ...s.violations] }));
    return rec;
  },
  review(id: string, decision: ReviewDecision, note?: string): boolean {
    const s0 = get();
    const target = s0.violations.find((v) => v.id === id);
    if (!target || target.status !== "pending" || !s0.operator.trim()) return false;
    set((s) => ({
      ...s,
      violations: s.violations.map((v) =>
        v.id === id ? applyReview(v, decision, s.operator, Date.now(), note) : v,
      ),
    }));
    return true;
  },
  notify(n: Omit<Notice, "id" | "ts" | "read">) {
    set((s) => ({
      ...s,
      notifications: [{ ...n, id: uid("n"), ts: Date.now(), read: false }, ...s.notifications].slice(0, 40),
    }));
  },
  markAllRead() {
    set((s) => ({ ...s, notifications: s.notifications.map((n) => ({ ...n, read: true })) }));
  },
  clearNotifications() {
    set((s) => ({ ...s, notifications: [] }));
  },
  setLimit(zone: keyof SpeedLimits, value: number) {
    set((s) => ({ ...s, limits: { ...s.limits, [zone]: value } }));
  },
  setGrace(value: number) {
    set((s) => ({ ...s, graceSeconds: value }));
  },
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    set((s) => ({ ...s, settings: { ...s.settings, [key]: value } }));
  },
  setOperator(name: string) {
    set((s) => ({ ...s, operator: name }));
  },
  setEmergency(active: boolean, label: string | null = null) {
    set((s) => ({ ...s, emergencyActive: active, emergencyLabel: active ? label : null }));
  },
  logEmergency(e: Omit<EmergencyLogEntry, "id" | "ts">) {
    set((s) => ({ ...s, emergencyLog: [{ ...e, id: uid("e"), ts: Date.now() }, ...s.emergencyLog] }));
  },
  resetDemo() {
    state = createInitialState();
    listeners.forEach((l) => l());
  },
};
