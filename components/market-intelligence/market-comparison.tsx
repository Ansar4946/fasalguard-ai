import { formatMarketPrice } from "@/features/market-intelligence/formatters";
import type { MarketComparisonItem } from "@/features/market-intelligence/types";

export function MarketComparison({
  markets,
}: {
  markets: MarketComparisonItem[];
}) {
  const ranked = [...markets].sort((a, b) => b.price - a.price);
  return (
    <article className="card p-4 sm:p-6">
      <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
        Compare nearby
      </p>
      <h2 className="mt-1 text-lg font-extrabold text-brand-dark">
        Nearby mandi comparison
      </h2>
      {ranked.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted">
          No comparison markets are available.
        </p>
      ) : (
        <ol className="mt-5 space-y-2">
          {ranked.map((market, index) => (
            <li
              key={`${market.market}-${market.observedAt}`}
              className={`grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-2xl border p-3 min-[390px]:grid-cols-[auto_minmax(0,1fr)_auto] sm:p-3.5 ${index === 0 ? "border-brand/20 bg-brand-soft/60" : "border-border bg-white"}`}
            >
              <span
                className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-extrabold ${index === 0 ? "bg-brand text-white" : "bg-surface-soft text-brand"}`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="truncate text-sm font-extrabold text-brand-dark">
                    {market.market}
                  </h3>
                  {index === 0 && (
                    <span className="rounded-full bg-white px-2 py-0.5 text-[8px] font-extrabold uppercase text-brand">
                      Highest listed price
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[9px] text-muted">
                  {market.district} · {market.source}
                </p>
              </div>
              <div className="col-span-2 flex items-end justify-between border-t border-brand/10 pt-2 text-left min-[390px]:col-span-1 min-[390px]:block min-[390px]:min-w-[7rem] min-[390px]:border-0 min-[390px]:pt-0 min-[390px]:text-right">
                <strong className="text-sm text-brand-dark">
                  {formatMarketPrice(market.price)}
                </strong>
                <p className="text-[8px] text-muted">
                  avg / {market.quantity} {market.unit}
                </p>
                <p className="mt-1 text-[8px] font-semibold text-brand/70">
                  {formatMarketPrice(market.minimumPrice)}–
                  {formatMarketPrice(market.maximumPrice)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      <p className="mt-4 text-[9px] leading-4 text-muted">
        A higher listed price may not mean a better net return. Verify grade,
        commission, transport cost and buyer terms.
      </p>
    </article>
  );
}
