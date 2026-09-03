"use client";

import { useMemo, useState } from "react";
import { formatMarketPrice } from "@/features/market-intelligence/formatters";

export function ProfitInsight({
  currentPrice,
  quantityKg,
}: {
  currentPrice: number;
  quantityKg: number;
}) {
  const [bags, setBags] = useState("100");
  const values = useMemo(() => {
    const count = Math.max(0, Number(bags) || 0);
    const current = count * currentPrice;
    return { current, scenario: count * currentPrice * 1.05 };
  }, [bags, currentPrice]);
  return (
    <article className="relative overflow-hidden rounded-[22px] border border-brand/10 bg-[#edf6e9] p-5 sm:p-6">
      <div
        aria-hidden="true"
        className="absolute -bottom-16 -right-10 size-44 rounded-full bg-brand-soft/70"
      />
      <div className="relative">
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
          Value calculator
        </p>
        <h2 className="mt-1 text-lg font-extrabold text-brand-dark">
          Potential value
        </h2>
        <p className="mt-2 text-xs leading-5 text-muted">
          Gross estimate before grading, commission, transport, taxes or losses.
        </p>
        <label
          htmlFor="market-bags"
          className="mt-5 block text-[10px] font-bold text-muted"
        >
          Estimated number of {quantityKg} KG bags
        </label>
        <input
          id="market-bags"
          type="number"
          min="0"
          max="100000"
          value={bags}
          onChange={(event) => setBags(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-brand/15 bg-white px-3 text-base font-extrabold sm:max-w-48"
        />
        <dl className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-white/80 p-4">
            <dt className="text-[9px] uppercase text-muted">
              Current gross value
            </dt>
            <dd className="mt-1 text-xl font-extrabold text-brand-dark">
              {formatMarketPrice(values.current)}
            </dd>
          </div>
          <div className="rounded-2xl bg-brand p-4 text-white">
            <dt className="text-[9px] uppercase text-white/60">
              Illustrative +5% scenario
            </dt>
            <dd className="mt-1 text-xl font-extrabold">
              {formatMarketPrice(values.scenario)}
            </dd>
            <p className="mt-1 text-[9px] text-white/60">
              Not a forecast or guaranteed profit
            </p>
          </div>
        </dl>
      </div>
    </article>
  );
}
