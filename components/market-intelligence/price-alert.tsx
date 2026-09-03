"use client";

import { useState } from "react";
import { formatMarketPrice } from "@/features/market-intelligence/formatters";
import { fixtureMarketService } from "@/features/market-intelligence/fixture-repository";

export function PriceAlert({
  crop,
  quantity,
  unit,
}: {
  crop: string;
  quantity: number;
  unit: string;
}) {
  const [target, setTarget] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(target);
    if (!Number.isFinite(value) || value <= 0) {
      setMessage("Enter a valid target price greater than zero.");
      return;
    }
    await fixtureMarketService.createPriceAlert({
      crop,
      location: "Punjab, Pakistan",
      targetPrice: value,
      quantity,
      unit: "KG",
    });
    setMessage(
      `Preview only: an alert for ${formatMarketPrice(value)} was not saved. Backend alert delivery is not connected.`,
    );
  }
  return (
    <article className="card p-5 sm:p-6">
      <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
        Watch a target
      </p>
      <h2 className="mt-1 text-lg font-extrabold text-brand-dark">
        Set price alert
      </h2>
      <p className="mt-2 text-xs leading-5 text-muted">
        Preview the alert flow for {crop}. This demo does not persist or send
        notifications.
      </p>
      <form onSubmit={submit} className="mt-5">
        <label
          className="text-[10px] font-bold text-muted"
          htmlFor="target-market-price"
        >
          Notify me when the demo price reaches
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <div className="flex min-h-12 flex-1 items-center rounded-xl border border-brand/15 bg-surface-soft focus-within:ring-2 focus-within:ring-brand/25">
            <span className="pl-3 text-xs font-bold text-muted">PKR</span>
            <input
              id="target-market-price"
              inputMode="numeric"
              min="1"
              step="1"
              value={target}
              onChange={(event) => {
                setTarget(event.target.value);
                setMessage(null);
              }}
              placeholder="4,500"
              className="min-w-0 flex-1 bg-transparent px-2 py-3 text-base font-extrabold outline-none"
            />
            <span className="pr-3 text-[9px] text-muted">
              /{quantity} {unit}
            </span>
          </div>
          <button
            type="submit"
            className="min-h-12 rounded-xl bg-brand px-5 text-xs font-extrabold text-white shadow-[0_8px_20px_rgba(7,95,61,.18)]"
          >
            Preview alert
          </button>
        </div>
      </form>
      {message && (
        <p
          role="status"
          className={`mt-3 rounded-xl px-3 py-2 text-[10px] leading-4 ${message.startsWith("Enter") ? "bg-danger/5 text-danger" : "bg-amber-50 text-amber-900"}`}
        >
          {message}
        </p>
      )}
    </article>
  );
}
