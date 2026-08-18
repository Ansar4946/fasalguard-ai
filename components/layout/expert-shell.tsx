"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/brand/brand-logo";

const expertNav = [
  { href: "/expert", label: "Dashboard", icon: "home" as const },
  { href: "/farms", label: "My Farms", icon: "farm" as const },
  { href: "/fields", label: "Fields", icon: "field" as const },
  {
    href: "/expert/consultations",
    label: "Expert Consultation",
    icon: "expert" as const,
  },
  {
    href: "/expert/outbreaks",
    label: "Outbreak Radar",
    icon: "radar" as const,
  },
  { href: "/alerts", label: "Alerts", icon: "bell" as const },
];
const expertMobileNav = [
  { href: "/expert", label: "Home", icon: "home" as const },
  { href: "/expert/consultations", label: "Consult", icon: "expert" as const },
  { href: "/scan", label: "Scan", icon: "scan" as const, primary: true },
  { href: "/expert/outbreaks", label: "Outbreaks", icon: "radar" as const },
  { href: "/alerts", label: "Alerts", icon: "bell" as const },
];

export function ExpertShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-[#f7faf5]">
      <a
        href="#expert-main"
        className="sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:p-3 focus:not-sr-only"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-[#00452d] px-3 py-5 text-white shadow-xl lg:flex">
        <Link
          href="/expert"
          className="mb-1 flex items-center gap-2 px-3 py-2 text-base font-extrabold"
        >
          <BrandLogo compact priority className="size-10 drop-shadow-md" />
          FasalGuard AI
        </Link>
        <p className="mb-6 px-3 text-[9px] font-bold uppercase tracking-widest text-[#95d4b2]">
          Digital Husbandry
        </p>
        <nav aria-label="Expert navigation" className="space-y-1">
          {expertNav.map((item) => {
            const active =
              item.href === "/expert"
                ? pathname === item.href
                : item.href === "/expert/consultations"
                  ? pathname.startsWith("/expert/consultations") ||
                    pathname.startsWith("/expert/cases")
                  : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-lg px-3 text-xs font-bold transition ${active ? "bg-white/12 text-[#b1f0cd]" : "text-white/75 hover:bg-white/8 hover:text-white"}`}
              >
                <Icon name={item.icon} className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href="/scan"
          className="mt-auto flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#3c6929] text-xs font-extrabold text-white"
        >
          <Icon name="scan" className="size-4" />
          Scan Crop
        </Link>
      </aside>
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-brand/10 bg-white/95 px-4 shadow-sm backdrop-blur lg:ml-60 lg:px-6">
        <Link
          href="/expert"
          className="flex items-center gap-2 whitespace-nowrap text-sm font-extrabold text-brand-dark lg:hidden"
        >
          <BrandLogo compact priority className="size-9 drop-shadow-sm" />
          <span className="hidden min-[390px]:inline">Expert</span>
        </Link>
        <label className="relative ml-4 hidden max-w-md flex-1 md:block">
          <span className="sr-only">
            Search expert cases, farmers or diseases
          </span>
          <Icon
            name="search"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            placeholder="Search case ID, farmer, or disease..."
            className="h-9 w-full rounded-full border-0 bg-[#eef4ff] pl-10 pr-3 text-xs outline-none ring-1 ring-transparent focus:ring-brand"
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden text-[9px] font-bold text-brand md:inline">
            English / Urdu
          </span>
          <Link
            href="/expert/cases"
            className="relative grid size-9 place-items-center rounded-full hover:bg-surface-soft"
            aria-label="Open urgent cases"
          >
            <Icon name="bell" className="size-4" />
            <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" />
          </Link>
          <LogoutButton className="hidden min-h-9 rounded-lg px-3 text-[10px] font-bold text-muted hover:bg-surface-soft sm:block" />
          <div className="grid size-8 place-items-center rounded-full bg-brand-soft text-[10px] font-extrabold text-brand-dark">
            DA
          </div>
        </div>
      </header>
      <main id="expert-main" className="pb-24 lg:ml-60 lg:pb-0">
        {children}
      </main>
      <nav
        className="fixed inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-40 grid h-[68px] grid-cols-5 rounded-2xl border border-brand/10 bg-white/95 px-1 shadow-[0_12px_40px_rgba(0,50,31,.2)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile expert navigation"
      >
        {expertMobileNav.map((item) => {
          const active =
            item.href === "/expert"
              ? pathname === item.href
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[9px] font-extrabold leading-none transition ${item.primary ? "-mt-4 mx-1 h-16 rounded-2xl bg-brand text-white shadow-[0_10px_24px_rgba(0,105,70,.3)]" : active ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-soft hover:text-brand"}`}
            >
              <Icon
                name={item.icon}
                className={item.primary ? "size-5" : "size-[18px]"}
              />
              <span className="max-w-full truncate">{item.label}</span>
              {active && !item.primary && (
                <span className="absolute bottom-1 size-1 rounded-full bg-brand" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
