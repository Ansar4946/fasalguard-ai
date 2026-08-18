"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/brand/brand-logo";

const nav = [
  { href: "/government", label: "Overview", icon: "home" as const },
  { href: "/government/impact", label: "Impact", icon: "report" as const },
  { href: "/government/districts", label: "Districts", icon: "field" as const },
  {
    href: "/government/advisories",
    label: "Advisories",
    icon: "bell" as const,
  },
  { href: "/government/reports", label: "Reports", icon: "task" as const },
];

export function GovernmentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/government" ? pathname === href : pathname.startsWith(href);
  return (
    <div className="min-h-dvh bg-background">
      <a
        href="#government-main"
        className="sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:bg-white focus:p-3 focus:not-sr-only"
      >
        Skip to main content
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-white p-4 lg:flex">
        <Link
          href="/government"
          className="mb-1 flex items-center gap-2 px-2 py-2 text-lg font-extrabold text-brand-dark"
        >
          <BrandLogo compact priority className="size-11 drop-shadow-md" />
          FasalGuard Governance
        </Link>
        <p className="mb-7 px-2 text-xs font-bold uppercase tracking-widest text-muted">
          Monitoring portal
        </p>
        <nav className="space-y-1" aria-label="Government navigation">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-bold ${isActive(item.href) ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-soft"}`}
            >
              <Icon name={item.icon} />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto rounded-2xl bg-brand-dark p-4 text-white">
          <p className="text-sm font-extrabold">Aggregated data only</p>
          <p className="mt-1 text-xs leading-5 text-white/70">
            Farmer identities and exact field coordinates are excluded.
          </p>
          <Link
            href="/dashboard"
            className="mt-3 inline-flex min-h-10 items-center text-xs font-bold underline"
          >
            Switch workspace
          </Link>
        </div>
      </aside>
      <header className="sticky top-0 z-20 flex h-16 items-center border-b border-border bg-white/95 px-4 backdrop-blur lg:ml-64 lg:px-7">
        <Link
          href="/government"
          className="flex items-center gap-2 whitespace-nowrap text-sm font-extrabold text-brand lg:hidden"
        >
          <BrandLogo compact priority className="size-9 drop-shadow-sm" />
          <span className="hidden min-[390px]:inline">Governance</span>
        </Link>
        <label className="relative ml-4 hidden max-w-md flex-1 md:block">
          <span className="sr-only">Search districts or crops</span>
          <Icon
            name="search"
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            placeholder="Search districts or crops"
            className="h-10 w-full rounded-xl border border-border bg-background pl-10 pr-3 text-sm"
          />
        </label>
        <div className="ml-auto flex items-center gap-2">
          <LogoutButton className="min-h-9 rounded-lg px-3 text-[10px] font-bold text-muted hover:bg-surface-soft" />
          <span className="max-w-[45vw] truncate rounded-full bg-brand-soft px-3 py-2 text-[10px] font-bold text-brand sm:text-xs">
            Governance workspace
          </span>
        </div>
      </header>
      <main id="government-main" className="pb-24 lg:ml-64 lg:pb-0">
        {children}
      </main>
      <nav
        className="fixed inset-x-2 bottom-[max(.5rem,env(safe-area-inset-bottom))] z-40 grid h-[68px] grid-cols-5 rounded-2xl border border-brand/10 bg-white/95 px-1 shadow-[0_12px_40px_rgba(0,50,31,.18)] backdrop-blur-xl lg:hidden"
        aria-label="Mobile government navigation"
      >
        {nav.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive(item.href) ? "page" : undefined}
            className={`relative flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 text-[9px] font-extrabold leading-none transition ${isActive(item.href) ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-soft hover:text-brand"}`}
          >
            <Icon name={item.icon} className="size-[18px]" />
            <span className="max-w-full truncate">{item.label}</span>
            {isActive(item.href) && (
              <span className="absolute bottom-1 size-1 rounded-full bg-brand" />
            )}
          </Link>
        ))}
      </nav>
    </div>
  );
}
