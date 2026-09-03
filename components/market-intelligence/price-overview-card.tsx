import { Icon } from "@/components/ui/icon";
import {
  formatMarketDate,
  formatMarketPrice,
} from "@/features/market-intelligence/formatters";
import type { MarketPrice } from "@/features/market-intelligence/types";

export function PriceOverviewCard({
  price,
  weeklyChange,
}: {
  price: MarketPrice;
  weeklyChange: number;
}) {
  return (
    <article className="relative overflow-hidden rounded-[20px] bg-brand-dark p-4 text-white shadow-[0_22px_55px_rgba(0,58,38,.2)] sm:rounded-[24px] sm:p-7">
      <div
        aria-hidden="true"
        className="absolute -right-16 -top-16 size-56 rounded-full border-[34px] border-white/5"
      />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-brand-dark">
            <Icon name="field" className="size-6" />
          </span>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/55">
              Latest Punjab average
            </p>
            <h2 className="mt-1 text-xl font-extrabold">{price.commodity}</h2>
          </div>
        </div>
        <span className="rounded-full border border-amber-200/30 bg-amber-300/15 px-3 py-1.5 text-[9px] font-extrabold uppercase tracking-wide text-amber-100">
          {price.freshness === "STALE" ? "Stale AMIS data" : "Live AMIS data"}
        </span>
      </div>
      <div className="relative mt-6 grid gap-4 sm:mt-7 md:grid-cols-[1fr_auto] md:items-end md:gap-6">
        <div>
          <strong className="block text-3xl tracking-tight min-[380px]:text-4xl sm:text-5xl">
            {formatMarketPrice(price.price)}
          </strong>
          <span className="mt-2 block text-sm font-semibold text-white/65">
            per {price.quantity} {price.unit}
          </span>
        </div>
        <div className="rounded-2xl bg-white/10 p-4 backdrop-blur-sm md:min-w-56">
          <p className="text-[9px] uppercase tracking-wider text-white/55">
            Latest observed movement
          </p>
          <p className="mt-1 text-lg font-extrabold text-[#c9f4ad]">
            {weeklyChange > 0 ? "+" : ""}
            {weeklyChange.toFixed(1)}%
          </p>
          <p className="mt-2 text-xs text-white/70">
            {price.market} · {price.district}
          </p>
        </div>
      </div>
      <dl className="relative mt-5 grid grid-cols-3 gap-1.5 sm:mt-6 sm:gap-2">
        {[
          { label: "Low", value: price.minimumPrice, tone: "text-emerald-100" },
          { label: "Average", value: price.price, tone: "text-lime-200" },
          { label: "High", value: price.maximumPrice, tone: "text-amber-200" },
        ].map((item) => (
          <div
            key={item.label}
            className="min-w-0 rounded-xl border border-white/10 bg-white/[.07] p-2 sm:rounded-2xl sm:p-4"
          >
            <dt className="text-[9px] font-bold uppercase tracking-[.14em] text-white/50">
              {item.label}
            </dt>
            <dd
              className={`mt-1 truncate text-[11px] font-extrabold min-[380px]:text-xs sm:text-lg ${item.tone}`}
            >
              {formatMarketPrice(item.value)}
            </dd>
            <span className="text-[7px] text-white/45 sm:text-[8px]">
              / 40 KG
            </span>
          </div>
        ))}
      </dl>
      <div className="relative mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4 text-[9px] text-white/55">
        <span>Source: {price.source}</span>
        <span>Official price date: {formatMarketDate(price.observedAt)}</span>
      </div>
    </article>
  );
}
