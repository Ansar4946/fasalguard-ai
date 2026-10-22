"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useSpeech } from "@/features/speech/use-speech";
import { fieldsChanged, fieldsFromExtracted, type EditableFields } from "@/features/dawai-check/manual";
import {
  buildSpeechText,
  checkText,
  clampScore,
  scoreRing,
  similarityPercent,
  sortChecks,
  verdictPresentation,
} from "@/features/dawai-check/presentation";
import type { CheckStatus, ExtractedLabel, Lang, PesticideCheckResult } from "@/features/dawai-check/types";
import {
  Disclaimer,
  ErrorBanner,
  GlyphIcon,
  inputClass,
  primaryButton,
  secondaryButton,
  Spinner,
  toneClasses,
  type IconKind,
  type T,
} from "./parts";

const statusMeta: Record<CheckStatus, { icon: IconKind; labelKey: string; chip: string }> = {
  fail: { icon: "x", labelKey: "statusFail", chip: "bg-danger text-white" },
  warn: { icon: "alert", labelKey: "statusWarn", chip: "bg-warning text-white" },
  unknown: { icon: "help", labelKey: "statusUnknown", chip: "bg-[#5b6a62] text-white" },
  pass: { icon: "check", labelKey: "statusPass", chip: "bg-success text-white" },
};

const readOnlyFields: Array<{ key: keyof ExtractedLabel; labelKey: string }> = [
  { key: "concentration", labelKey: "fieldConcentration" },
  { key: "formulation", labelKey: "fieldFormulation" },
  { key: "company", labelKey: "fieldCompany" },
  { key: "batchNo", labelKey: "fieldBatchNo" },
  { key: "manufacturingDate", labelKey: "fieldManufacturingDate" },
];

export function ResultView({
  t,
  lang,
  result,
  rechecking,
  recheckError,
  offline,
  onRecheck,
  onNew,
  onRetake,
}: {
  t: T;
  lang: Lang;
  result: PesticideCheckResult;
  rechecking: boolean;
  recheckError: string;
  offline: boolean;
  onRecheck: (fields: EditableFields) => void;
  onNew: () => void;
  onRetake: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const speech = useSpeech();
  const p = verdictPresentation(result.verdict, result.demoDataset);
  const tone = toneClasses[p.tone];
  const score = clampScore(result.score);
  const ring = scoreRing(score);
  const original = fieldsFromExtracted(result.extracted);
  const [edited, setEdited] = useState<{ id: string; fields: EditableFields } | null>(null);
  const fields = edited?.id === result.id ? edited.fields : original;
  const changed = fieldsChanged(fields, original);
  const checks = sortChecks(result.checks ?? []);

  useEffect(() => {
    headingRef.current?.focus();
  }, [result.id]);

  const stopRef = useRef(speech.stop);
  useEffect(() => {
    stopRef.current = speech.stop;
  });
  useEffect(() => () => stopRef.current(), []);

  function setField(key: keyof EditableFields, value: string): void {
    setEdited({ id: result.id, fields: { ...fields, [key]: value } });
  }

  const editable: Array<{ key: keyof EditableFields; labelKey: string; type?: string; dir?: "ltr" }> = [
    { key: "brandName", labelKey: "fieldBrandName" },
    { key: "activeIngredient", labelKey: "fieldActiveIngredient" },
    { key: "registrationNo", labelKey: "fieldRegistrationNo", dir: "ltr" },
    { key: "expiryDate", labelKey: "fieldExpiryDate", type: "date", dir: "ltr" },
  ];

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">
        {t("resultReady")}
      </p>

      {/* Hero verdict */}
      <section aria-labelledby="dc-verdict-title" className={`rounded-2xl border-2 p-4 shadow-sm sm:p-5 ${tone.card}`}>
        {p.showDemoBadge && (
          <div className="mb-3 inline-flex items-center gap-2 rounded-lg border-2 border-[#ffe14d] bg-[#111] px-3 py-1.5 text-sm font-black tracking-wide text-[#ffe14d]">
            {t("demoBadge")}
          </div>
        )}
        <div className="flex items-start gap-4">
          <span className={`grid size-14 shrink-0 place-items-center rounded-2xl ${tone.solid}`}>
            <GlyphIcon kind={p.icon} className="size-8" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold uppercase tracking-wide text-muted">{t("verdictWord")}</p>
            <h2 id="dc-verdict-title" ref={headingRef} tabIndex={-1} className={`text-xl font-extrabold leading-snug outline-none ${tone.text}`}>
              {t(p.titleKey)}
            </h2>
          </div>
          <div className="relative size-20 shrink-0" role="img" aria-label={`${t("scoreLabel")}: ${score} ${t("scoreOutOf")}`}>
            <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
              <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="9" />
              <circle
                cx="50"
                cy="50"
                r="42"
                fill="none"
                stroke={tone.stroke}
                strokeWidth="9"
                strokeLinecap="round"
                strokeDasharray={ring.circumference}
                strokeDashoffset={ring.dashOffset}
              />
            </svg>
            <span dir="ltr" className="absolute inset-0 grid place-items-center text-lg font-black text-foreground">
              {score}
            </span>
          </div>
        </div>
        <p className="mt-3 text-sm font-semibold leading-6 text-foreground">{t(p.summaryKey)}</p>
        {p.showDemoBadge && <p className="mt-2 text-xs font-bold text-muted">{t("demoBadgeNote")}</p>}
        {result.explanation && result.language === lang && (
          <p className="mt-2 text-sm leading-6 text-foreground">{result.explanation}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {p.showRetake && (
            <button type="button" onClick={onRetake} className={primaryButton}>
              <GlyphIcon kind="camera" className="size-5" /> {t("retake")}
            </button>
          )}
          {speech.supported && (
            <button
              type="button"
              aria-pressed={speech.speaking}
              aria-label={t("listenAria")}
              onClick={() => (speech.speaking ? speech.stop() : speech.speak(buildSpeechText(result, lang, t), lang))}
              className={secondaryButton}
            >
              <GlyphIcon kind="speaker" className="size-5" /> {speech.speaking ? t("stopListening") : t("listen")}
            </button>
          )}
        </div>
      </section>

      {/* Product */}
      <section aria-labelledby="dc-product-title" className="card space-y-3 p-4">
        <h3 id="dc-product-title" className="text-sm font-extrabold text-brand-dark">
          {t("productRead")}
        </h3>
        <p className="text-lg font-extrabold">{result.extracted?.brandName || t("notRead")}</p>
        <div className="rounded-xl bg-surface-soft p-3">
          <p className="text-xs font-bold text-muted">{t("registryMatch")}</p>
          {result.matchedProduct ? (
            <>
              <p className="mt-1 font-extrabold">{result.matchedProduct.brandName}</p>
              <p className="text-xs text-muted">
                {[result.matchedProduct.activeIngredient, result.matchedProduct.concentration, result.matchedProduct.company]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="mt-2 text-xs font-bold text-brand-dark">
                {t("matchConfidence")}: <span dir="ltr">{similarityPercent(result.matchedProduct.similarity)}%</span>
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm font-semibold">{t("noMatch")}</p>
          )}
        </div>
      </section>

      {/* What we read */}
      <section aria-labelledby="dc-read-title" className="card space-y-3 p-4">
        <div>
          <h3 id="dc-read-title" className="text-sm font-extrabold text-brand-dark">
            {t("whatWeRead")}
          </h3>
          <p className="mt-1 text-xs text-muted">{t("whatWeReadHint")}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {editable.map((field) => (
            <label key={field.key} className="rounded-xl border border-border bg-white p-2 text-xs font-bold text-muted focus-within:border-brand">
              {t(field.labelKey)}
              <input
                type={field.type ?? "text"}
                dir={field.dir}
                value={fields[field.key]}
                placeholder={t("notRead")}
                maxLength={160}
                onChange={(e) => setField(field.key, e.target.value)}
                className={`${inputClass} mt-1 !min-h-10 border-0 bg-surface-soft`}
              />
            </label>
          ))}
        </div>
        <dl className="grid gap-2 sm:grid-cols-2">
          {readOnlyFields.map(({ key, labelKey }) => (
            <div key={key} className="rounded-xl bg-surface-soft px-3 py-2">
              <dt className="text-xs font-bold text-muted">{t(labelKey)}</dt>
              <dd className="text-sm font-semibold">{(result.extracted?.[key] as string | null | undefined) || t("notRead")}</dd>
            </div>
          ))}
        </dl>
        {recheckError && <ErrorBanner message={recheckError} />}
        <button
          type="button"
          onClick={() => onRecheck(fields)}
          disabled={!changed || rechecking || offline || !fields.brandName.trim()}
          className={`${primaryButton} w-full sm:w-auto`}
        >
          {rechecking ? <Spinner className="size-4" /> : <GlyphIcon kind="refresh" className="size-4" />}
          {rechecking ? t("rechecking") : t("recheck")}
        </button>
      </section>

      {/* Checks */}
      <section aria-labelledby="dc-checks-title" className="card p-4">
        <h3 id="dc-checks-title" className="text-sm font-extrabold text-brand-dark">
          {t("checksTitle")}
        </h3>
        {checks.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("noChecks")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {checks.map((check) => {
              const meta = statusMeta[check.status] ?? statusMeta.unknown;
              const text = checkText(check, lang);
              return (
                <li key={check.code} className="flex gap-3 rounded-xl border border-border p-3">
                  <span className={`grid size-8 shrink-0 place-items-center rounded-full ${meta.chip}`}>
                    <GlyphIcon kind={meta.icon} className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold">
                      <span className="me-2 text-xs font-extrabold uppercase text-muted">{t(meta.labelKey)}</span>
                      {text.title}
                    </p>
                    {text.detail && <p className="mt-1 text-xs leading-5 text-muted">{text.detail}</p>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Next steps */}
      <section aria-labelledby="dc-next-title" className="card p-4">
        <h3 id="dc-next-title" className="text-sm font-extrabold text-brand-dark">
          {t("nextStepsTitle")}
        </h3>
        <ul className="mt-3 space-y-2 text-sm">
          {p.nextStepKeys.map((key) => (
            <li key={key} className="flex gap-2">
              <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-brand" />
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <Link href="/consultations" className={`${secondaryButton} mt-4 w-full sm:w-auto`}>
          {t("expertLink")}
        </Link>
      </section>

      <p className="rounded-2xl border-2 border-brand/30 bg-white p-3 text-center text-sm font-extrabold text-brand-dark">
        {t("disclaimerShort")}
      </p>
      <Disclaimer t={t} />

      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-border bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <button type="button" onClick={onNew} className={`${primaryButton} w-full sm:w-auto`}>
          <GlyphIcon kind="camera" className="size-5" /> {t("newCheck")}
        </button>
      </div>
    </div>
  );
}
