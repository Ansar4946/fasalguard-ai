"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { badgeText, parseUnreadCount, unreadLabel } from "@/features/notifications/notifications";

const CHANGED = "fasalguard:notifications-changed";
const REFRESH_MS = 60_000;

/** Real unread count from the API. Shows no badge when the count is zero or unknown. */
export function NotificationBell({ icon }: { icon: React.ReactNode }) {
  const [count, setCount] = useState<number | null>(null);
  const mounted = useRef(true);
  const ticket = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const load = () => {
      const mine = ++ticket.current;
      fetch("/api/notifications/unread-count", { cache: "no-store" })
        .then(async (response) => (response.ok ? parseUnreadCount(await response.json().catch(() => null)) : null))
        .catch(() => null)
        .then((value) => {
          if (mounted.current && mine === ticket.current) setCount(value);
        });
    };
    load();
    const timer = setInterval(load, REFRESH_MS);
    window.addEventListener(CHANGED, load);
    document.addEventListener("visibilitychange", load);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener(CHANGED, load);
      document.removeEventListener("visibilitychange", load);
    };
  }, []);

  const text = badgeText(count);
  return (
    <Link
      href="/alerts"
      aria-label={`View notifications. ${unreadLabel(count)}`}
      className="relative grid size-10 place-items-center rounded-lg hover:bg-surface-soft"
    >
      {icon}
      {text && (
        <span
          data-testid="notification-badge"
          className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[9px] font-extrabold leading-4 text-white"
        >
          {text}
        </span>
      )}
    </Link>
  );
}
