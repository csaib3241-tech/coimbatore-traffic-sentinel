import { Activity, BarChart3, Gauge, LayoutDashboard, Network, ScanLine, Settings, Siren } from "lucide-react";

export const NAV = [
  { to: "/", label: "Dashboard", hint: "Live command centre", icon: LayoutDashboard },
  { to: "/speed", label: "Speed Monitoring", hint: "Geofenced speed limits", icon: Gauge },
  { to: "/violations", label: "Violation Detection", hint: "AI camera & ANPR", icon: ScanLine },
  { to: "/emergency", label: "Emergency Response", hint: "Route & signal priority", icon: Siren },
  { to: "/analytics", label: "Analytics", hint: "Trends & reports", icon: BarChart3 },
  { to: "/architecture", label: "System Architecture", hint: "How it works", icon: Network },
  { to: "/settings", label: "Settings", hint: "Limits & alerts", icon: Settings },
] as const;

export type NavPath = (typeof NAV)[number]["to"];
export { Activity };
