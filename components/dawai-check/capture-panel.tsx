/* eslint-disable @next/next/no-img-element -- object-URL previews are local-only. */
"use client";

import { useEffect, useRef, useState } from "react";
import { validateSourceFile } from "@/features/dawai-check/image";
import { PhotoError, preparePhoto } from "@/features/dawai-check/prepare-photo";
import { analysePhotoQuality } from "@/features/dawai-check/quality";
import type { QualityHint } from "@/features/dawai-check/ui";
import {
  ErrorBanner,
  GlyphIcon,
  haptic,
  inputClass,
  primaryButton,
  secondaryButton,
  Spinner,
  type IconKind,
  type T,
} from "./parts";

export interface PhotoState {
  file: File;
  previewUrl: string;
}

const tips: Array<{ key: string; icon: IconKind }> = [
  { key: "tipLight", icon: "sun" },
  { key: "tipFlat", icon: "frame" },
  { key: "tipGlare", icon: "glare" },
];

const hintKey: Record<QualityHint, string> = {
  ok: "qualityOk",
  dark: "qualityDark",
  bright: "qualityBright",
  tiny: "qualityTiny",
  blurry: "qualityBlurry",
};

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
  const dragDepth = useRef(0);
  const [preparing, setPreparing] = useState(false);
  const [fileError, setFileError] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [ripple, setRipple] = useState(0);
  const [quality, setQuality] = useState<{ file: File; hint: QualityHint } | null>(null);

  const photoFile = photo?.file;
  useEffect(() => {
    if (!photoFile) return;
    let cancelled = false;
    void analysePhotoQuality(photoFile).then((hint) => {
      if (!cancelled) setQuality({ file: photoFile, hint });
    });
    return () => {
      cancelled = true;
    };
  }, [photoFile]);
  const hint = photo && quality?.file === photo.file ? quality.hint : null;

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

  /** One file input serves both: the camera (capture=environment) and the gallery (no capture attribute). */
  function openPicker(camera: boolean): void {
    const input = inputRef.current;
    if (!input) return;
    if (camera) input.setAttribute("capture", "environment");
    else input.removeAttribute("capture");
    input.click();
  }

  const message = fileError || error;

  return (
    <section aria-labelledby="dc-capture-title" className="space-y-4">
      <div>
        <h2 id="dc-capture-title" className="text-lg font-extrabold text-brand-dark">
          {t("captureTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted">{t("captureHint")}</p>
      </div>

      <div
        className={`card overflow-hidden transition-shadow duration-200 ${dragging ? "shadow-[0_0_0_3px_var(--brand)]" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          dragDepth.current += 1;
          setDragging(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={() => {
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          dragDepth.current = 0;
          setDragging(false);
          void handleFile(event.dataTransfer.files?.[0]);
        }}
      >
        <div
          className={`relative isolate flex min-h-[15rem] w-full items-center justify-center overflow-hidden bg-gradient-to-br from-[#f3faee] via-white to-brand-soft/60 transition-colors duration-200 ${dragging ? "dc-drop-active" : ""}`}
        >
          {photo ? (
            <>
              <img src={photo.previewUrl} alt="" aria-hidden="true" className="absolute inset-0 size-full scale-110 object-cover opacity-40 blur-xl" />
              <img src={photo.previewUrl} alt={t("previewAlt")} className="dc-view-in absolute inset-0 size-full object-contain p-2" />
            </>
          ) : (
            <>
              <span className="dc-bracket border-s-4 border-t-4 rounded-ss-2xl start-4 top-4" aria-hidden="true" />
              <span className="dc-bracket border-e-4 border-t-4 rounded-se-2xl end-4 top-4" aria-hidden="true" />
              <span className="dc-bracket border-s-4 border-b-4 rounded-es-2xl start-4 bottom-4" aria-hidden="true" />
              <span className="dc-bracket border-e-4 border-b-4 rounded-ee-2xl end-4 bottom-4" aria-hidden="true" />
              <div aria-hidden="true" className="pointer-events-none absolute inset-4 overflow-hidden rounded-2xl">
                <span className="dc-beam" />
              </div>
              <div className="relative z-10 flex flex-col items-center gap-3 px-8 py-8 text-center">
                <button
                  type="button"
                  onClick={() => {
                    setRipple((n) => n + 1);
                    haptic();
                    openPicker(true);
                  }}
                  disabled={preparing}
                  className="dc-press dc-focus relative grid size-20 place-items-center overflow-hidden rounded-full bg-gradient-to-b from-[#0a7049] to-brand text-white shadow-[0_10px_26px_rgb(7_95_61/38%)] disabled:opacity-70"
                  aria-label={t("scanBtn")}
                >
                  {ripple > 0 && <span key={ripple} className="dc-ripple" aria-hidden="true" />}
                  {preparing ? <Spinner className="size-8" /> : <GlyphIcon kind="camera" className="size-9" />}
                </button>
                <p className="text-base font-extrabold text-brand-dark">{preparing ? t("preparing") : t("scanBtn")}</p>
                <button
                  type="button"
                  onClick={() => openPicker(false)}
                  disabled={preparing}
                  className="dc-press dc-focus inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand/40 bg-white/80 px-4 text-sm font-bold text-brand"
                >
                  <GlyphIcon kind="image" className="size-4" /> {t("uploadBtn")}
                </button>
                <p className="hidden text-xs font-semibold text-muted sm:block">{t("dropHint")}</p>
              </div>
            </>
          )}
          <p className="pointer-events-none absolute inset-x-0 top-3 z-10 flex justify-center px-10 text-center">
            <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-brand-dark shadow-sm ring-1 ring-border">
              {dragging ? t("dropActive") : t("frameGuide")}
            </span>
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
          <div className="space-y-3 border-t border-border p-3">
            {hint && (
              <p
                role="status"
                className={`dc-view-in flex items-start gap-2 rounded-xl px-3 py-2 text-xs font-bold ${
                  hint === "ok" ? "bg-brand-soft/70 text-brand-dark" : "bg-[#fff6e2] text-[#7a4300]"
                }`}
              >
                <GlyphIcon kind={hint === "ok" ? "check" : "alert"} className="mt-0.5 size-4 shrink-0" />
                <span>{t(hintKey[hint])}</span>
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={onClear} disabled={preparing} className={`${secondaryButton} flex-1`}>
                <GlyphIcon kind="refresh" className="size-4" /> {t("retake")}
              </button>
              <button type="button" onClick={() => openPicker(false)} disabled={preparing} className={`${secondaryButton} flex-1`}>
                {preparing ? <Spinner className="size-4" /> : <GlyphIcon kind="image" className="size-4" />} {t("replacePhoto")}
              </button>
            </div>
          </div>
        )}
      </div>

      <ul className="flex flex-wrap gap-2" aria-label={t("captureTitle")}>
        {tips.map((tip) => (
          <li key={tip.key} className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3 text-xs font-bold text-brand-dark ring-1 ring-brand/10">
            <GlyphIcon kind={tip.icon} className="size-4" /> {t(tip.key)}
          </li>
        ))}
      </ul>

      <div className="card p-3">
        <button
          type="button"
          aria-expanded={showMore}
          aria-controls="dc-more-details"
          onClick={() => setShowMore((v) => !v)}
          className="dc-focus flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-start text-sm font-bold text-brand-dark"
        >
          <span>{t("moreDetails")}</span>
          <GlyphIcon kind="chevron" className="dc-chevron size-5 shrink-0" />
        </button>
        {showMore && (
          <div id="dc-more-details" className="dc-view-in mt-2 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold text-muted">
              {t("priceLabel")}
              <input className={inputClass} inputMode="decimal" dir="ltr" value={price} onChange={(e) => onPrice(e.target.value)} />
            </label>
            <label className="grid gap-1 text-xs font-bold text-muted">
              {t("packSizeLabel")}
              <input className={inputClass} maxLength={60} value={packSize} onChange={(e) => onPackSize(e.target.value)} />
            </label>
          </div>
        )}
      </div>

      {message && <ErrorBanner message={message} actionLabel={photo && error ? t("retry") : undefined} onAction={onSubmit} />}

      <button
        type="button"
        onClick={onManual}
        className="dc-press dc-focus min-h-11 w-full rounded-xl text-center text-sm font-bold text-brand underline underline-offset-4"
      >
        {t("photoNotWorking")}
      </button>

      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-border bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <button type="button" onClick={onSubmit} disabled={!photo || preparing || offline} className={`${primaryButton} w-full`}>
          <GlyphIcon kind="scan" className="size-5" /> {t("checkNow")}
        </button>
      </div>
    </section>
  );
}
