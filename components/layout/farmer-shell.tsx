"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/brand/brand-logo";
import { UpgradeNudge } from "@/components/billing/upgrade-nudge";

type NavItem = {
  href: string;
  label: string;
  icon: Parameters<typeof Icon>[0]["name"];
};
const navigation: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "home" as const },
  { href: "/farms", label: "My Farms", icon: "farm" as const },
  { href: "/fields", label: "Fields", icon: "field" as const },
  { href: "/scan", label: "Scan Crop", icon: "scan" as const },
  {
    href: "/satellite",
    label: "Satellite Monitoring",
    icon: "satellite" as const,
  },
  { href: "/weather", label: "Weather Intelligence", icon: "weather" as const },
  { href: "/radar", label: "Outbreak Radar", icon: "radar" as const },
  { href: "/alerts", label: "Alerts", icon: "bell" as const },
  { href: "/tasks", label: "Tasks", icon: "task" as const },
  { href: "/consultations", label: "Expert Support", icon: "expert" as const },
  { href: "/assistant", label: "AI Assistant", icon: "expert" as const },
  { href: "/learning", label: "Learning Centre", icon: "learn" as const },
  { href: "/reports", label: "Reports", icon: "report" as const },
];
const farmNavigation = [
  navigation[0],
  navigation[1],
  navigation[2],
  navigation[3],
  { href: "/analytics", label: "Analytics", icon: "report" as const },
  { href: "/settings", label: "Settings", icon: "settings" as const },
];

function NavLink({
  item,
  compact = false,
  onNavigate,
}: {
  item: NavItem;
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const darkShell = pathname === "/dashboard";
  const active =
    pathname === item.href ||
    pathname.startsWith(`${item.href}/`) ||
    (item.href === "/farms" && pathname.includes("/farms/"));
  const mobileLabel =
    item.href === "/dashboard"
      ? "Home"
      : item.href === "/farms"
        ? "Farms"
        : item.href === "/scan"
          ? "Scan"
          : item.href === "/radar"
            ? "Radar"
            : item.label;
  if (compact) {
    return (
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`group flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-1 text-[10px] font-bold leading-none transition-all duration-200 sm:text-[11px] ${active ? "text-brand-dark" : "text-[#63736b] hover:text-brand-dark"}`}
      >
        <span
          className={`grid size-8 place-items-center rounded-xl transition-all duration-200 ${active ? "bg-brand text-white shadow-[0_5px_14px_rgba(0,91,61,0.24)]" : "bg-transparent group-hover:bg-brand-soft"}`}
        >
          <Icon name={item.icon} className="size-[18px]" />
        </span>
        <span className="w-full truncate text-center">{mobileLabel}</span>
      </Link>
    );
  }
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${darkShell ? (active ? "bg-white/14 text-white" : "text-white/72 hover:bg-white/10 hover:text-white") : active ? "bg-brand-soft text-brand-dark" : "text-muted hover:bg-surface-soft hover:text-foreground"}`}
    >
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

export function FarmerShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dashboardShell = pathname === "/dashboard";
  const farmShell =
    pathname === "/farms" ||
    pathname.startsWith("/farms/") ||
    pathname === "/fields" ||
    pathname === "/scan" ||
    pathname.startsWith("/scan/");
  const visibleNavigation = farmShell ? farmNavigation : navigation;
  useEffect(() => {
    if (!mobileMenuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) =>
      event.key === "Escape" && setMobileMenuOpen(false);
    document.addEventListener("keydown", closeOnEscape);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = previousOverflow;
    };
  }, [mobileMenuOpen]);
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#main-content"
        className="sr-only z-50 bg-white p-3 focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to main content
      </a>
      <aside
        className={`fixed inset-y-0 left-0 z-30 hidden w-64 border-r p-4 lg:flex lg:flex-col ${dashboardShell ? "border-white/10 bg-[#00452d] text-white" : farmShell ? "border-brand/10 bg-[#edf6e9]" : "border-border bg-surface"}`}
      >
        <Link
          href="/dashboard"
          aria-label="FasalGuard AI dashboard"
          className={`mb-4 flex shrink-0 items-center gap-2 px-2 text-lg font-extrabold ${dashboardShell ? "text-white" : "text-brand-dark"}`}
        >
          <BrandLogo compact priority className="size-11 drop-shadow-md" />
          <span>
            FasalGuard{" "}
            <span
              className={dashboardShell ? "text-brand-soft" : "text-success"}
            >
              AI
            </span>
          </span>
        </Link>
        <div className="relative min-h-0 flex-1">
          <nav
            aria-label="Farmer navigation"
            className="sidebar-scroll h-full space-y-0.5 overflow-y-auto overscroll-contain pb-4 pr-1"
          >
            {visibleNavigation.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </nav>
          <div
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t ${dashboardShell ? "from-[#00452d]" : "from-[#edf6e9]"} to-transparent`}
          />
        </div>
        {farmShell ? (
          <div className="mt-2 shrink-0">
            <UpgradeNudge />
            <div className="mt-4 border-t border-brand/10 pt-3 text-xs text-muted">
              <p className="py-1">Support</p>
              <LogoutButton className="min-h-9 w-full text-left text-danger" />
            </div>
          </div>
        ) : (
          <div className="mt-2 grid shrink-0 gap-2">
            <LogoutButton
              className={`min-h-9 rounded-xl text-[10px] font-bold ${dashboardShell ? "text-white/65 hover:bg-white/10" : "text-muted hover:bg-surface-soft"}`}
            />
            <Link
              href="/scan"
              className={`inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-xs font-extrabold ${dashboardShell ? "bg-brand-soft text-brand-dark" : "bg-brand text-white"}`}
            >
              Scan crop
            </Link>
          </div>
        )}
      </aside>
      <header className="sticky top-0 z-20 flex h-16 items-center gap-2 border-b border-border bg-white/95 px-3 backdrop-blur lg:ml-64 lg:px-7">
        <button
          type="button"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open navigation menu"
          aria-expanded={mobileMenuOpen}
          className="grid size-10 shrink-0 place-items-center rounded-xl border border-brand/10 bg-brand-soft/60 text-brand-dark transition hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:hidden"
        >
          <Icon name="menu" />
        </button>
        <Link
          href="/dashboard"
          className="flex items-center gap-2 font-extrabold text-brand-dark lg:hidden"
        >
          <BrandLogo compact priority className="size-9 drop-shadow-sm" />
          <span className="hidden sm:inline">FasalGuard AI</span>
        </Link>
        <label className="relative hidden max-w-md flex-1 md:block">
          <span className="sr-only">Search farms, fields and alerts</span>
          <Icon
            name="search"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            placeholder="Search farms, fields or alerts"
            className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm"
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-xs font-semibold text-muted sm:inline">
            24°C · Multan
          </span>
          <button
            type="button"
            aria-label="Change language"
            className="min-h-10 rounded-lg px-3 text-xs font-bold hover:bg-surface-soft"
          >
            EN / اردو
          </button>
          <Link
            href="/alerts"
            aria-label="View notifications"
            className="relative grid size-10 place-items-center rounded-lg hover:bg-surface-soft"
          >
            <Icon name="bell" />
            <span className="absolute right-2 top-2 size-2 rounded-full bg-danger">
              <span className="sr-only">2 unread notifications</span>
            </span>
          </Link>
          <div
            className="grid size-9 place-items-center rounded-full bg-brand-soft text-xs font-extrabold text-brand-dark"
            aria-label="Signed in as Ahmad"
          >
            AA
          </div>
        </div>
      </header>
      <div
        className={`fixed inset-0 z-50 lg:hidden ${mobileMenuOpen ? "pointer-events-auto" : "pointer-events-none"}`}
        aria-hidden={!mobileMenuOpen}
      >
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileMenuOpen(false)}
          className={`absolute inset-0 bg-[#001f16]/55 backdrop-blur-sm transition-opacity duration-300 ${mobileMenuOpen ? "opacity-100" : "opacity-0"}`}
        />
        <aside
          role="dialog"
          aria-modal="true"
          aria-label="Farmer navigation"
          className={`absolute inset-y-0 left-0 flex w-[min(88vw,21rem)] flex-col overflow-y-auto border-r border-white/10 bg-[#00452d] p-4 text-white shadow-2xl transition-transform duration-300 ease-out ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full"}`}
        >
          <div className="mb-5 flex items-center justify-between">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="flex items-center gap-2 text-lg font-extrabold"
            >
              <BrandLogo compact className="size-11 drop-shadow-md" />
              <span>
                FasalGuard <span className="text-[#b8ee9f]">AI</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              aria-label="Close navigation menu"
              className="grid size-11 place-items-center rounded-xl bg-white/10 text-white hover:bg-white/15"
            >
              <Icon name="plus" className="size-5 rotate-45" />
            </button>
          </div>
          <p className="mb-3 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-white/55">
            Farmer workspace
          </p>
          <nav aria-label="All farmer pages" className="space-y-1">
            {navigation.map((item) => (
              <NavLink
                key={item.href}
                item={item}
                onNavigate={() => setMobileMenuOpen(false)}
              />
            ))}
          </nav>
          <div className="mt-auto grid gap-2 pt-5">
            <LogoutButton className="min-h-11 rounded-xl border border-white/15 text-xs font-bold text-white/75" />
            <Link
              href="/scan"
              onClick={() => setMobileMenuOpen(false)}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#c9f4ad] px-4 text-sm font-extrabold text-brand-dark shadow-lg"
            >
              <Icon name="scan" />
              Scan crop
            </Link>
          </div>
        </aside>
      </div>
      <main
        id="main-content"
        className="min-w-0 overflow-x-clip pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:ml-64 lg:pb-0"
      >
        {children}
      </main>
      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-brand/10 bg-white/95 px-2 pt-1.5 shadow-[0_-10px_30px_rgba(0,55,38,0.08)] backdrop-blur-xl pb-[max(0.4rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        <div className="mx-auto grid h-[60px] max-w-lg grid-cols-5 gap-0.5">
          {[
            navigation[0],
            navigation[1],
            navigation[3],
            navigation[4],
            navigation[5],
          ].map((item) => (
            <NavLink key={item.href} item={item} compact />
          ))}
        </div>
      </nav>
    </div>
  );
}
