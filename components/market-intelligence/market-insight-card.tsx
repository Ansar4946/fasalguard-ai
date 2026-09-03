import { Icon } from "@/components/ui/icon";
import type { MarketInsight } from "@/features/market-intelligence/types";

export function MarketInsightCard({ insight }: { insight: MarketInsight }) {
  return (
    <article className="overflow-hidden rounded-[22px] border border-amber-200 bg-[#fff8df] shadow-sm">
      <div className="border-b border-amber-200/80 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-white">
            <Icon name="market" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold text-brand-dark">
                Market insight
              </h2>
              <span className="rounded-full bg-amber-200 px-2 py-1 text-[8px] font-extrabold uppercase text-amber-950">
                Deterministic AMIS summary
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-amber-950/80">
              {insight.summary}
            </p>
          </div>
        </div>
      </div>
      <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6">
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-amber-900">
            Evidence used
          </p>
          <ul className="mt-2 space-y-2 text-xs text-amber-950/75">
            {insight.evidence.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-success">
                  ●
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-[9px] font-extrabold uppercase tracking-wider text-amber-900">
            Still missing
          </p>
          <ul className="mt-2 space-y-2 text-xs text-amber-950/75">
            {insight.missingEvidence.map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true" className="text-warning">
                  ○
                </span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
      <p className="border-t border-amber-200/80 px-5 py-3 text-[9px] leading-4 text-amber-900 sm:px-6">
        <strong>Uncertainty:</strong> {insight.uncertainty}
      </p>
    </article>
  );
}
