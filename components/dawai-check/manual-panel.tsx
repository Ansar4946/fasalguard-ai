"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchProducts } from "@/features/dawai-check/client";
import type { EditableFields } from "@/features/dawai-check/manual";
import type { ProductSuggestion } from "@/features/dawai-check/types";
import { ErrorBanner, inputClass, primaryButton, Spinner, type T } from "./parts";

type SearchState = { query: string; items: ProductSuggestion[]; failed: boolean } | null;

export function ManualPanel({
  t,
  fields,
  onFields,
  onSubmit,
  onBack,
  error,
  offline,
}: {
  t: T;
  fields: EditableFields;
  onFields: (fields: EditableFields) => void;
  onSubmit: () => void;
  onBack: () => void;
  error: string;
  offline: boolean;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [search, setSearch] = useState<SearchState>(null);
  const query = fields.brandName.trim();
  const searchable = query.length >= 2;
  const seq = useRef(0);

  useEffect(() => {
    if (!open || !searchable) return;
    const controller = new AbortController();
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      try {
        const items = await searchProducts(query, controller.signal);
        if (mine === seq.current) setSearch({ query, items: items.slice(0, 8), failed: false });
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        if (mine === seq.current) setSearch({ query, items: [], failed: true });
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, open, searchable]);

  const settled = searchable && search?.query === query ? search : null;
  const items = settled?.items ?? [];
  const loading = open && searchable && !settled;
  const expanded = open && searchable;

  function pick(item: ProductSuggestion): void {
    onFields({ ...fields, brandName: item.brandName, activeIngredient: item.activeIngredient || fields.activeIngredient });
    setOpen(false);
    setActive(-1);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "ArrowDown" && items.length) {
      event.preventDefault();
      setOpen(true);
      setActive((a) => (a + 1) % items.length);
    } else if (event.key === "ArrowUp" && items.length) {
      event.preventDefault();
      setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
    } else if (event.key === "Enter" && expanded && active >= 0 && items[active]) {
      event.preventDefault();
      pick(items[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setActive(-1);
    }
  }

  const status = loading ? t("searching") : expanded && settled && !items.length ? t("noSuggestions") : "";

  return (
    <section aria-labelledby="dc-manual-title" className="space-y-4">
      <div>
        <h2 id="dc-manual-title" className="text-lg font-extrabold text-brand-dark">
          {t("manualTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("manualHint")}</p>
      </div>

      <div className="card space-y-4 p-4">
        <div className="relative">
          <label htmlFor={`${listId}-brand`} className="mb-1 block text-xs font-bold text-muted">
            {t("brandLabel")}
          </label>
          <input
            id={`${listId}-brand`}
            role="combobox"
            aria-expanded={expanded && items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={active >= 0 ? `${listId}-opt-${active}` : undefined}
            autoComplete="off"
            maxLength={160}
            placeholder={t("brandPlaceholder")}
            className={inputClass}
            value={fields.brandName}
            onChange={(e) => {
              onFields({ ...fields, brandName: e.target.value });
              setOpen(true);
              setActive(-1);
            }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            onKeyDown={onKeyDown}
          />
          <ul
            id={listId}
            role="listbox"
            aria-label={t("suggestionsLabel")}
            hidden={!(expanded && items.length > 0)}
            className="absolute inset-x-0 z-20 mt-1 max-h-64 overflow-auto rounded-xl border border-border bg-white shadow-lg"
          >
            {items.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-opt-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                className={`min-h-11 cursor-pointer px-3 py-2 text-sm ${index === active ? "bg-brand-soft" : "hover:bg-surface-soft"}`}
              >
                <span className="block font-bold text-foreground">{item.brandName}</span>
                <span className="block text-xs text-muted">
                  {[item.activeIngredient, item.company].filter(Boolean).join(" · ")}
                </span>
              </li>
            ))}
          </ul>
          <p role="status" aria-live="polite" className={status ? "mt-1 flex items-center gap-2 text-xs font-semibold text-muted" : "sr-only"}>
            {loading && <Spinner className="size-3" />}
            {status}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-xs font-bold text-muted">
            {t("ingredientLabel")}
            <input
              className={inputClass}
              maxLength={160}
              value={fields.activeIngredient}
              onChange={(e) => onFields({ ...fields, activeIngredient: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            {t("registrationLabel")}
            <input
              className={inputClass}
              dir="ltr"
              maxLength={80}
              value={fields.registrationNo}
              onChange={(e) => onFields({ ...fields, registrationNo: e.target.value })}
            />
          </label>
          <label className="grid gap-1 text-xs font-bold text-muted">
            {t("expiryLabel")}
            <input
              className={inputClass}
              type="date"
              dir="ltr"
              value={fields.expiryDate}
              onChange={(e) => onFields({ ...fields, expiryDate: e.target.value })}
            />
          </label>
        </div>
      </div>

      {error && <ErrorBanner message={error} actionLabel={t("retry")} onAction={onSubmit} />}

      <button type="button" onClick={onBack} className="min-h-11 w-full text-center text-sm font-bold text-brand underline underline-offset-4">
        {t("backToPhoto")}
      </button>

      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-border bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <button type="button" onClick={onSubmit} disabled={offline || !fields.brandName.trim()} className={`${primaryButton} w-full`}>
          {t("checkName")}
        </button>
      </div>
    </section>
  );
}
