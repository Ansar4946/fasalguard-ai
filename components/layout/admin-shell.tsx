"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogoutButton } from "@/components/auth/logout-button";
import { BrandLogo } from "@/components/brand/brand-logo";

const nav = [
  { href: "/admin/billing", label: "Billing" },
  { href: "/admin/funnel", label: "Funnel" },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-dvh bg-background">
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-white/95 px-4 backdrop-blur md:px-7">
        <Link href="/admin/billing" className="flex items-center gap-2 text-sm font-extrabold text-brand-dark">
          <BrandLogo compact priority className="size-9 drop-shadow-sm" />
          FasalGuard Admin
        </Link>
        <span className="ml-2 rounded-full bg-brand-soft px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-brand">
          Real data only
        </span>
        <nav className="ml-4 hidden items-center gap-1 sm:flex" aria-label="Admin navigation">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={pathname === item.href ? "page" : undefined}
              className={`min-h-9 rounded-lg px-3 py-2 text-xs font-bold ${pathname === item.href ? "bg-brand-soft text-brand" : "text-muted hover:bg-surface-soft"}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <LogoutButton className="min-h-9 rounded-lg px-3 text-[10px] font-bold text-muted hover:bg-surface-soft" />
          <Link
            href="/dashboard"
            className="min-h-9 rounded-lg px-3 text-[10px] font-bold text-muted underline underline-offset-2 hover:bg-surface-soft"
          >
            Switch workspace
          </Link>
        </div>
      </header>
      <main className="pb-16">{children}</main>
    </div>
  );
}
