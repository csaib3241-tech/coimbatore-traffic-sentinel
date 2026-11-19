import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { Bell, CheckCheck, Menu, Radio, Search, ShieldCheck, Siren, LogOut, UserCog, RotateCcw } from "lucide-react";
import { NAV } from "./nav";
import { Logo } from "@/components/common/Logo";
import { LiveClock, LiveDot, TimeText } from "@/components/common/ui-bits";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { actions, useAppStore, type NoticeLevel } from "@/lib/store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { pathname } = useLocation();
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
        const Icon = item.icon;
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            {active && <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-primary glow-primary" />}
            <Icon className={cn("size-[18px] shrink-0", active ? "text-primary" : "text-muted-foreground group-hover:text-primary")} />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{item.label}</span>
              <span className="block truncate text-[11px] text-muted-foreground">{item.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

function SystemHealth() {
  const items = [
    { label: "ANPR cameras", value: "42 / 44", tone: "safe" as const },
    { label: "GPS geofence", value: "Online", tone: "safe" as const },
    { label: "Signal network", value: "96 nodes", tone: "safe" as const },
    { label: "MQTT latency", value: "38 ms", tone: "primary" as const },
  ];
  return (
    <div className="rounded-xl border border-sidebar-border bg-background/40 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-safe">
        <LiveDot tone="safe" /> All systems operational
      </div>
      {items.map((i) => (
        <div key={i.label} className="flex justify-between py-0.5 text-[11px]">
          <span className="text-muted-foreground">{i.label}</span>
          <span className={i.tone === "safe" ? "text-safe" : "text-primary"}>{i.value}</span>
        </div>
      ))}
      <p className="mt-2 border-t border-sidebar-border pt-2 text-[10px] leading-snug text-muted-foreground">
        Demonstration prototype · simulated data
      </p>
    </div>
  );
}

const LEVEL_DOT: Record<NoticeLevel, string> = {
  info: "bg-primary",
  success: "bg-safe",
  warning: "bg-warning",
  critical: "bg-critical",
  emergency: "bg-emergency",
};

function Notifications() {
  const notices = useAppStore((s) => s.notifications);
  const unread = notices.filter((n) => !n.read).length;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-critical px-1 text-[10px] font-bold text-critical-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[340px] border-glass-border bg-popover p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div>
            <p className="text-sm font-semibold">Notifications</p>
            <p className="text-xs text-muted-foreground">{unread} unread alerts</p>
          </div>
          <Button size="sm" variant="ghost" onClick={() => actions.markAllRead()}>
            <CheckCheck /> Mark read
          </Button>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {notices.length === 0 && <p className="p-6 text-center text-sm text-muted-foreground">No alerts right now.</p>}
          {notices.map((n) => (
            <div key={n.id} className={cn("flex gap-3 border-b border-border/60 px-4 py-3", !n.read && "bg-primary/5")}>
              <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", LEVEL_DOT[n.level])} />
              <div className="min-w-0">
                <p className="text-sm font-medium">{n.title}</p>
                <p className="text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-1 text-[10px] text-muted-foreground"><TimeText ts={n.ts} mode="relative" /></p>
              </div>
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Profile() {
  const operator = useAppStore((s) => s.operator);
  const navigate = useNavigate();
  const initials = operator.replace(/^[A-Za-z]+\.\s*/, "").split(/\s+/).map((p) => p[0]).join("").slice(0, 2);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2.5 rounded-xl px-1.5 py-1 transition-colors hover:bg-accent/60">
          <span className="grid size-8 place-items-center rounded-lg bg-gradient-primary text-xs font-bold text-primary-foreground">{initials}</span>
          <span className="hidden text-left leading-tight lg:block">
            <span className="block text-sm font-medium">{operator}</span>
            <span className="block text-[11px] text-muted-foreground">Traffic Control Officer</span>
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex items-center gap-2 text-xs text-safe"><ShieldCheck className="size-3.5" /> Authorised reviewer</div>
          <div className="mt-1 text-sm">{operator}</div>
          <div className="text-xs font-normal text-muted-foreground">Coimbatore Traffic Control Room</div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate({ to: "/settings" })}><UserCog /> Profile & settings</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => { actions.resetDemo(); toast.success("Demo data reset"); }}><RotateCcw /> Reset demo data</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => toast("Signed out of demo session", { description: "This prototype keeps you signed in as the demo officer." })}><LogOut /> Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PlateSearch() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  return (
    <form
      className="relative hidden w-full max-w-xs md:block"
      onSubmit={(e) => {
        e.preventDefault();
        navigate({ to: "/violations", search: { q: q.trim() || undefined } });
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search number plate…"
        className="h-9 w-full rounded-xl border border-input bg-background/50 pl-9 pr-3 text-sm outline-none transition focus:border-primary/60 focus:ring-2 focus:ring-primary/20"
      />
    </form>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const emergencyActive = useAppStore((s) => s.emergencyActive);
  const emergencyLabel = useAppStore((s) => s.emergencyLabel);
  const { pathname } = useLocation();
  const current = NAV.find((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col gap-6 border-r border-sidebar-border bg-sidebar/80 p-4 backdrop-blur-xl lg:flex">
        <Logo className="px-1 pt-1" />
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
        <SystemHealth />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-glass-border bg-background/70 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-3 px-4 md:px-6">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu"><Menu /></Button>
              </SheetTrigger>
              <SheetContent side="left" className="flex w-72 flex-col gap-6 border-sidebar-border bg-sidebar p-4">
                <SheetTitle className="sr-only">Navigation</SheetTitle>
                <Logo />
                <div className="flex-1 overflow-y-auto"><NavList onNavigate={() => setOpen(false)} /></div>
                <SystemHealth />
              </SheetContent>
            </Sheet>
            <Logo compact className="lg:hidden" />
            <div className="hidden min-w-0 md:block">
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Coimbatore Smart Corridor</p>
              <p className="truncate text-sm font-semibold">{current?.label ?? "Sentinel Road"}</p>
            </div>
            <div className="flex flex-1 justify-center px-2"><PlateSearch /></div>

            {emergencyActive ? (
              <Link to="/emergency" className="hidden items-center gap-2 rounded-full border border-emergency/50 bg-emergency/15 px-3 py-1.5 text-xs font-semibold text-emergency glow-emergency sm:flex">
                <Siren className="size-4 animate-pulse" /> {emergencyLabel ?? "Emergency coordination active"}
              </Link>
            ) : (
              <div className="hidden items-center gap-2 rounded-full border border-safe/30 bg-safe/10 px-3 py-1.5 text-xs font-medium text-safe xl:flex">
                <Radio className="size-3.5" /> Live · <LiveClock />
              </div>
            )}
            <Notifications />
            <Profile />
          </div>
          {emergencyActive && (
            <Link to="/emergency" className="flex items-center justify-center gap-2 bg-emergency/90 px-4 py-1 text-xs font-semibold text-emergency-foreground sm:hidden">
              <Siren className="size-3.5 animate-pulse" /> Emergency coordination active
            </Link>
          )}
        </header>
        <main key={pathname} className="flex-1 px-4 py-6 animate-in fade-in slide-in-from-bottom-2 duration-500 md:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
