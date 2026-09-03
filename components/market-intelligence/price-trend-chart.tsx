import type {
  MarketRange,
  PricePoint,
} from "@/features/market-intelligence/types";
import { formatMarketPrice } from "@/features/market-intelligence/formatters";

const ranges: Array<{ value: MarketRange; label: string }> = [
  { value: "7D", label: "7 days" },
  { value: "30D", label: "30 days" },
  { value: "SEASON", label: "Season" },
];

export function PriceTrendChart({
  points,
  range,
  crop,
  quantity,
  unit,
  onRangeChange,
}: {
  points: PricePoint[];
  range: MarketRange;
  crop: string;
  quantity: number;
  unit: string;
  onRangeChange: (range: MarketRange) => void;
}) {
  const values = points.map((item) => item.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const coordinates = points
    .map((item, index) => {
      const x = points.length === 1 ? 50 : (index / (points.length - 1)) * 100;
      const y = 88 - ((item.price - min) / span) * 68;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <article className="card min-w-0 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
            Price direction
          </p>
          <h2 className="mt-1 text-lg font-extrabold text-brand-dark">
            {crop} price trend
          </h2>
        </div>
        <div
          className="grid grid-cols-3 rounded-xl border border-brand/10 bg-surface-soft p-1"
          aria-label="Price history range"
        >
          {ranges.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onRangeChange(item.value)}
              aria-pressed={range === item.value}
              className={`min-h-9 rounded-lg px-2 text-[10px] font-bold sm:px-3 ${range === item.value ? "bg-brand text-white shadow-sm" : "text-muted hover:text-brand-dark"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {points.length === 0 ? (
        <p className="mt-5 rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted">
          No price history is available.
        </p>
      ) : (
        <>
          <div
            className="mt-6 h-52"
            role="img"
            aria-label={`${range.toLowerCase()} ${crop} AMIS price trend from ${formatMarketPrice(min)} to ${formatMarketPrice(max)} per ${quantity} ${unit}.`}
          >
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="size-full overflow-visible"
            >
              <defs>
                <linearGradient
                  id="market-trend-area"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0" stopColor="#55a968" stopOpacity=".35" />
                  <stop offset="1" stopColor="#55a968" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[20, 42, 64, 88].map((y) => (
                <line
                  key={y}
                  x1="0"
                  x2="100"
                  y1={y}
                  y2={y}
                  stroke="#dfe8dc"
                  strokeWidth=".5"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <polygon
                points={`0,88 ${coordinates} 100,88`}
                fill="url(#market-trend-area)"
              />
              <polyline
                points={coordinates}
                fill="none"
                stroke="#075f3d"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
          <div className="mt-3 grid grid-cols-3 items-center text-[8px] font-semibold text-muted sm:text-[9px]">
            <span>
              {new Date(points[0]?.observedAt ?? "").toLocaleDateString(
                "en-PK",
                { day: "numeric", month: "short" },
              )}
            </span>
            <span className="text-center">{formatMarketPrice(max)} high</span>
            <span className="text-right">
              {new Date(points.at(-1)?.observedAt ?? "").toLocaleDateString(
                "en-PK",
                { day: "numeric", month: "short" },
              )}
            </span>
          </div>
        </>
      )}
      <p className="mt-4 text-[9px] leading-4 text-muted">
        Trend uses available AMIS observation dates and averages reporting
        markets for each date.
      </p>
    </article>
  );
}
