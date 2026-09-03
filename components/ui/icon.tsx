type IconName = "home" | "farm" | "field" | "scan" | "satellite" | "weather" | "market" | "radar" | "task" | "expert" | "learn" | "report" | "settings" | "bell" | "menu" | "search" | "plus";

const paths: Record<IconName, React.ReactNode> = {
  home: <><path d="m3 11 9-8 9 8"/><path d="M5 10v10h14V10M9 20v-6h6v6"/></>,
  farm: <><path d="M3 21V9l9-6 9 6v12"/><path d="M7 21v-8h10v8M3 21h18"/></>,
  field: <><path d="M4 19c3-5 7-8 16-10M4 14c4-3 9-5 16-6M4 9c5-2 10-3 16-3"/><path d="M4 5v14h16V5"/></>,
  scan: <><path d="M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4"/><path d="M8 12h8M12 8v8"/></>,
  satellite: <><path d="m8 16-4 4m12-12 4-4M9 5l10 10-4 4L5 9z"/><path d="M4 14a6 6 0 0 0 6 6M4 10a10 10 0 0 0 10 10"/></>,
  weather: <><circle cx="8" cy="8" r="3"/><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7"/><path d="M8 18h10a3 3 0 0 0 0-6 5 5 0 0 0-9.6 1.8A2.5 2.5 0 0 0 8 18Z"/></>,
  market: <><path d="M4 19V9M10 19V5M16 19v-7M3 19h18"/><path d="m4 8 5-4 5 4 6-5M17 3h3v3"/></>,
  radar: <><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><path d="M12 12 18 6M12 12h.01"/></>,
  task: <><path d="M9 5h11M9 12h11M9 19h11"/><path d="m3 5 1 1 2-2m-3 8 1 1 2-2m-3 8 1 1 2-2"/></>,
  expert: <><circle cx="12" cy="8" r="4"/><path d="M4 21c1-5 4-7 8-7s7 2 8 7"/></>,
  learn: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V4H6.5A2.5 2.5 0 0 0 4 6.5z"/><path d="M4 6.5v13M8 8h8"/></>,
  report: <><path d="M6 3h9l3 3v15H6z"/><path d="M14 3v4h4M9 12h6M9 16h6"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1A7 7 0 0 0 15 6l-.4-2.5h-4L10 6a7 7 0 0 0-1.5 1l-2.4-1-2 3.4L6 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1A7 7 0 0 0 10 18l.5 2.5h4L15 18a7 7 0 0 0 1.5-1l2.4 1 2-3.4-2-1.5a7 7 0 0 0 .1-1Z"/></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16"/>,
  search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
  plus: <path d="M12 5v14M5 12h14"/>,
};

export function Icon({ name, className = "size-5" }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
