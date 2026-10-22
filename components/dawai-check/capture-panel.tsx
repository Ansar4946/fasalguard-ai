/* eslint-disable @next/next/no-img-element -- object-URL previews are local-only. */
"use client";

import { useRef, useState } from "react";
import { validateSourceFile } from "@/features/dawai-check/image";
import { PhotoError, preparePhoto } from "@/features/dawai-check/prepare-photo";
import { ErrorBanner, GlyphIcon, inputClass, primaryButton, secondaryButton, Spinner, type T } from "./parts";

export interface PhotoState {
  file: File;
  previewUrl: string;
}

export function CapturePanel({
  t,
  photo,
  onPhoto,
  onClear,
  price,
  onPrice,
  packSize,
  onPackSize,
  onSubmit,
  onManual,
  error,
  offline,
}: {
  t: T;
  photo: PhotoState | null;
  onPhoto: (photo: PhotoState) => void;
  onClear: () => void;
  price: string;
  onPrice: (value: string) => void;
  packSize: string;
  onPackSize: (value: string) => void;
  onSubmit: () => void;
  onManual: () => void;
  error: string;
  offline: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState("");
  const [showMore, setShowMore] = useState(false);

  async function handleFile(file?: File): Promise<void> {
    if (!file) return;
    setFileError("");
    const problem = validateSourceFile(file.type, file.size);
    if (problem) {
      setFileError(t(problem === "type" ? "errBadFile" : "errBigFile"));
      return;
    }
    setPreparing(true);
    try {
      const prepared = await preparePhoto(file);
      onPhoto(prepared);
    } catch (cause) {
      setFileError(t(cause instanceof PhotoError && cause.code === "tooBig" ? "errBigFile" : "errUnreadablePhoto"));
    } finally {
      setPreparing(false);
    }
  }

  const tips = ["tipLight", "tipFlat", "tipBrand", "tipExpiry"];
  const message = fileError || error;

  return (
    <section aria-labelledby="dc-capture-title" className="space-y-4">
      <div>
        <h2 id="dc-capture-title" className="text-lg font-extrabold text-brand-dark">
          {t("captureTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("captureHint")}</p>
      </div>

      <div className="card overflow-hidden">
        <div className="relative aspect-[4/3] w-full bg-surface-soft">
          {photo ? (
            <img src={photo.previewUrl} alt={t("previewAlt")} className="absolute inset-0 size-full object-contain" />
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={preparing}
              className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-brand"
            >
              <span className="grid size-16 place-items-center rounded-full bg-brand text-white shadow-md">
                {preparing ? <Spinner className="size-7" /> : <GlyphIcon kind="camera" className="size-8" />}
              </span>
              <span className="text-base font-extrabold text-brand-dark">{preparing ? t("preparing") : t("takePhoto")}</span>
            </button>
          )}
          {/* Framing guide */}
          <div aria-hidden="true" className="pointer-events-none absolute inset-4 rounded-2xl border-2 border-dashed border-brand/50" />
          <p className="pointer-events-none absolute inset-x-0 top-6 px-8 text-center">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-brand-dark shadow-sm">{t("frameGuide")}</span>
          </p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          aria-label={t("choosePhoto")}
          onChange={(event) => {
            void handleFile(event.target.files?.[0]);
            event.target.value = "";
          }}
        />
        {photo && (
          <div className="flex flex-wrap gap-2 border-t border-border p-3">
            <button type="button" onClick={onClear} disabled={preparing} className={`${secondaryButton} flex-1`}>
              <GlyphIcon kind="refresh" className="size-4" /> {t("retake")}
            </button>
          </div>
        )}
      </div>

      <ul className="flex flex-wrap gap-2" aria-label={t("captureTitle")}>
        {tips.map((key) => (
          <li key={key} className="inline-flex min-h-8 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-bold text-brand-dark">
            <GlyphIcon kind="check" className="size-3.5" /> {t(key)}
          </li>
        ))}
      </ul>

      <div className="card p-3">
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="dc-more-details"
          onClick={() => setShowMore((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 text-start text-sm font-bold text-brand-dark"
        >
          <span>{t("moreDetails")}</span>
          <span aria-hidden="true" className="text-lg">{showMore ? "−" : "+"}</span>
        </button>
        {showMore && (
          <div id="dc-more-details" className="mt-2 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {t("priceLabel")}
              <input
                className={inputClass}
                inputMode="decimal"
                dir="ltr"
                value={price}
                onChange={(e) => onPrice(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {t("packSizeLabel")}
              <input className={inputClass} maxLength={60} value={packSize} onChange={(e) => onPackSize(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {message && <ErrorBanner message={message} actionLabel={photo && error ? t("retry") : undefined} onAction={onSubmit} />}

      <button type="button" onClick={onManual} className="min-h-11 w-full text-center text-sm font-bold text-brand underline underline-offset-4">
        {t("photoNotWorking")}
      </button>

      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-border bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <button type="button" onClick={onSubmit} disabled={!photo || preparing || offline} className={`${primaryButton} w-full`}>
          {t("checkNow")}
        </button>
      </div>
    </section>
  );
}
