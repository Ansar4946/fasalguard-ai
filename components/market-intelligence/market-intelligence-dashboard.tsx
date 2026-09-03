"use client";

import { useEffect, useState } from "react";
import { MarketHeader } from "./market-header";
import { PriceOverviewCard } from "./price-overview-card";
import { PriceTrendChart } from "./price-trend-chart";
import { MarketComparison } from "./market-comparison";
import { MarketInsightCard } from "./market-insight-card";
import { PriceAlert } from "./price-alert";
import { ProfitInsight } from "./profit-insight";
import {
  defaultLiveMarketCrop,
  liveMarketCrops,
  liveMarketLocations,
  liveMarketService,
} from "@/features/market-intelligence/api-repository";
import type {
  MarketIntelligenceSnapshot,
  MarketRange,
} from "@/features/market-intelligence/types";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; snapshot: MarketIntelligenceSnapshot }
  | { status: "empty" }
  | { status: "error"; message: string };

const crops = [...liveMarketCrops];
const locations = [...liveMarketLocations];

export function MarketIntelligenceDashboard() {
  const [crop, setCrop] = useState<string>(defaultLiveMarketCrop);
  const [location, setLocation] = useState<string>(
    locations[0] ?? "Punjab, Pakistan",
  );
  const [range, setRange] = useState<MarketRange>("7D");
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    liveMarketService
      .getMarketSummary({ crop, location })
      .then((snapshot) => {
        if (active)
          setState(
            snapshot ? { status: "ready", snapshot } : { status: "empty" },
          );
      })
      .catch(() => {
        if (active)
          setState({
            status: "error",
            message:
              "Live AMIS mandi data could not be loaded. Check your session and try again.",
          });
      });
    return () => {
      active = false;
    };
  }, [crop, location, reload]);

  return (
    <div className="min-h-[calc(100dvh-4rem)] bg-[#f8f5ec]">
      <div className="mx-auto w-full max-w-7xl px-3 pb-28 pt-5 min-[380px]:px-4 sm:px-6 sm:pb-8 sm:pt-8 xl:px-8">
        <MarketHeader
          crop={crop}
          location={location}
          crops={crops}
          locations={locations}
          onCropChange={(value) => {
            setCrop(value);
            setState({ status: "loading" });
          }}
          onLocationChange={(value) => {
            setLocation(value);
            setState({ status: "loading" });
          }}
        />
        <div
          className="mt-4 flex items-start gap-2.5 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-3 text-[10px] leading-[1.15rem] text-amber-950 sm:mt-5 sm:gap-3 sm:px-4 sm:leading-5"
          role="note"
        >
          <span
            className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-amber-200 font-extrabold"
            aria-hidden="true"
          >
            !
          </span>
          <p className="min-w-0">
            <strong>Live AMIS data:</strong> these are published mandi
            observations, not guaranteed sale offers. Verify crop grade,
            commission and the current rate with the market before selling.
          </p>
        </div>
        {state.status === "loading" && <MarketLoading />}
        {state.status === "error" && (
          <MarketError
            message={state.message}
            onRetry={() => {
              setState({ status: "loading" });
              setReload((value) => value + 1);
            }}
          />
        )}
        {state.status === "empty" && <MarketEmpty />}
        {state.status === "ready" && (
          <div className="mt-4 space-y-3 sm:mt-5 sm:space-y-4">
            <MarketPulse snapshot={state.snapshot} />
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
              <PriceOverviewCard
                price={state.snapshot.current}
                weeklyChange={state.snapshot.weeklyChangePercent}
              />
              <MarketComparison markets={state.snapshot.nearbyMarkets} />
            </section>
            <section className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(20rem,.75fr)]">
              <PriceTrendChart
                points={state.snapshot.history[range]}
                range={range}
                crop={state.snapshot.current.commodity}
                quantity={state.snapshot.current.quantity}
                unit={state.snapshot.current.unit}
                onRangeChange={setRange}
              />
              <MarketInsightCard insight={state.snapshot.insight} />
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <PriceAlert
                crop={state.snapshot.current.commodity}
                quantity={state.snapshot.current.quantity}
                unit={state.snapshot.current.unit}
              />
              <ProfitInsight
                currentPrice={state.snapshot.current.price}
                quantityKg={state.snapshot.current.quantity}
              />
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

function MarketPulse({ snapshot }: { snapshot: MarketIntelligenceSnapshot }) {
  const summary = snapshot.marketSummary;
  const items = [
    {
      label: "Price date",
      value: new Intl.DateTimeFormat("en-PK", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Karachi",
      }).format(new Date(snapshot.current.observedAt)),
      detail:
        snapshot.current.freshness === "STALE"
          ? "Older AMIS observation"
          : "Latest AMIS observation",
    },
    {
      label: "Market coverage",
      value: `${summary.reportingMarkets} mandis`,
      detail: "Punjab reporting markets",
    },
    {
      label: "Observed spread",
      value: `${Math.round((summary.spread / Math.max(summary.averagePrice, 1)) * 100)}%`,
      detail: `${summary.spread.toLocaleString("en-PK")} PKR / 40 KG`,
    },
    { label: "Decision basis", value: "40 KG", detail: "All rates normalized" },
  ];
  return (
    <section
      className="grid grid-cols-2 gap-1.5 rounded-[20px] border border-brand/10 bg-white/80 p-1.5 shadow-[0_12px_35px_rgba(17,75,48,.06)] sm:gap-2 sm:rounded-[22px] sm:p-2 xl:grid-cols-4"
      aria-label="Market data summary"
    >
      {items.map((item, index) => (
        <div
          key={item.label}
          className={`min-w-0 rounded-2xl px-3 py-3 sm:px-4 ${index === 0 ? "bg-brand-soft/60" : "bg-white"}`}
        >
          <p className="text-[9px] font-extrabold uppercase tracking-[.14em] text-success">
            {item.label}
          </p>
          <p className="mt-1 truncate text-sm font-extrabold text-brand-dark sm:text-base">
            {item.value}
          </p>
          <p className="mt-0.5 text-[9px] text-muted">{item.detail}</p>
        </div>
      ))}
    </section>
  );
}

function MarketLoading() {
  return (
    <div
      className="mt-5 grid animate-pulse gap-4 xl:grid-cols-2"
      role="status"
      aria-label="Loading market intelligence preview"
    >
      <div className="h-72 rounded-3xl bg-brand/10" />
      <div className="h-72 rounded-3xl bg-white/70" />
      <span className="sr-only">Loading market intelligence preview…</span>
    </div>
  );
}
function MarketError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div
      className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-3xl border border-danger/20 bg-danger/5 p-6 text-center"
      role="alert"
    >
      <h2 className="font-extrabold text-danger">Market preview unavailable</h2>
      <p className="mt-2 text-xs text-muted">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 min-h-11 rounded-xl bg-brand px-5 text-xs font-extrabold text-white"
      >
        Try again
      </button>
    </div>
  );
}
function MarketEmpty() {
  return (
    <div className="mt-5 flex min-h-64 flex-col items-center justify-center rounded-3xl border border-dashed border-brand/20 bg-white/40 p-6 text-center">
      <h2 className="font-extrabold text-brand-dark">No AMIS market records</h2>
      <p className="mt-2 max-w-sm text-xs leading-5 text-muted">
        No live records currently match this crop and location.
      </p>
    </div>
  );
}
