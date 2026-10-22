"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
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
import { buildShareText } from "@/features/dawai-check/ui";
import {
  Disclaimer,
  ErrorBanner,
  GlyphIcon,
  haptic,
  inputClass,
  primaryButton,
  secondaryButton,
  Spinner,
  toneClasses,
  useReducedMotion,
  type IconKind,
  type T,
} from "./parts";

const statusMeta: Record<CheckStatus, { icon: IconKind; labelKey: string; chip: string; border: string }> = {
  fail: { icon: "x", labelKey: "statusFail", chip: "bg-danger text-white", border: "border-s-danger" },
  warn: { icon: "alert", labelKey: "statusWarn", chip: "bg-warning text-white", border: "border-s-warning" },
  unknown: { icon: "help", labelKey: "statusUnknown", chip: "bg-[#5b6a62] text-white", border: "border-s-[#5b6a62]" },
  pass: { icon: "check", labelKey: "statusPass", chip: "bg-success text-white", border: "border-s-success" },
};

const readOnlyFields: Array<{ key: keyof ExtractedLabel; labelKey: string }> = [
  { key: "concentration", labelKey: "fieldConcentration" },
  { key: "formulation", labelKey: "fieldFormulation" },
  { key: "company", labelKey: "fieldCompany" },
  { key: "batchNo", labelKey: "fieldBatchNo" },
  { key: "manufacturingDate", labelKey: "fieldManufacturingDate" },
];

const stepIcons: Record<string, IconKind> = {
  stepReceipt: "receipt",
  stepHelpline: "phone",
  stepExpert: "expert",
  stepKeep: "ban",
  stepRetake: "camera",
  stepManual: "type",
};

const howKeys = ["howName", "howIngredient", "howReg", "howExpiry", "howCompany", "howPrice", "howRead", "howBanned"];

const rise = (i: number): CSSProperties => ({ "--dc-i": i }) as CSSProperties;

/** Counts up to `target` over ~1 s (requestAnimationFrame, one loop); shows the final value instantly for reduced motion. */
function useCountUp(target: number, reduced: boolean): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reduced) return;
    let frame = 0;
    const start = performance.now() + 220;
    const tick = (now: number) => {
      const p = Math.min(1, Math.max(0, (now - start) / 950));
      setValue(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reduced]);
  return reduced ? target : value;
}

async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
}

function RiskRing({ score, label, outOf, color }: { score: number; label: string; outOf: string; color: string }) {
  const reduced = useReducedMotion();
  const ring = scoreRing(score);
  const shown = useCountUp(score, reduced);
  return (
    <div className="flex shrink-0 flex-col items-center gap-1">
      <div className="relative size-20 sm:size-24" role="img" aria-label={`${label}: ${score} ${outOf}`}>
        <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden="true">
          <circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="9" />
          <circle
            className="dc-ring-arc"
            cx="50"
            cy="50"
            r="42"
            fill="none"
            stroke={color}
            strokeWidth="9"
            strokeLinecap="round"
            strokeDasharray={ring.circumference}
            style={{ strokeDashoffset: ring.dashOffset, "--dc-circ": ring.circumference } as CSSProperties}
          />
        </svg>
        <span dir="ltr" aria-hidden="true" className="absolute inset-0 grid place-items-center text-2xl font-black tabular-nums text-white">
          {shown}
        </span>
      </div>
      <span aria-hidden="true" className="text-[11px] font-extrabold uppercase tracking-wider text-white">
        {label}
      </span>
    </div>
  );
}

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
  const idBase = useId();
  const p = verdictPresentation(result.verdict, result.demoDataset);
  const tone = toneClasses[p.tone];
  const score = clampScore(result.score);
  const original = fieldsFromExtracted(result.extracted);
  const [edited, setEdited] = useState<{ id: string; fields: EditableFields } | null>(null);
  const [openChecks, setOpenChecks] = useState<Record<string, boolean>>({});
  const [howOpen, setHowOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");
  const fields = edited?.id === result.id ? edited.fields : original;
  const changed = fieldsChanged(fields, original);
  const checks = sortChecks(result.checks ?? []);
  const counts = (["fail", "warn", "unknown", "pass"] as CheckStatus[])
    .map((status) => ({ status, n: checks.filter((c) => c.status === status).length }))
    .filter((c) => c.n > 0);

  useEffect(() => {
    headingRef.current?.focus();
  }, [result.id]);

  const stopRef = useRef(speech.stop);
  useEffect(() => {
    stopRef.current = speech.stop;
  });
  useEffect(() => () => stopRef.current(), []);

  useEffect(() => {
    if (copyState === "idle") return;
    const id = window.setTimeout(() => setCopyState("idle"), 2600);
    return () => window.clearTimeout(id);
  }, [copyState]);

  function setField(key: keyof EditableFields, value: string): void {
    setEdited({ id: result.id, fields: { ...fields, [key]: value } });
  }

  async function copySummary(): Promise<void> {
    haptic();
    const ok = await copyText(buildShareText(result, lang, t));
    setCopyState(ok ? "ok" : "fail");
  }

  const editable: Array<{ key: keyof EditableFields; labelKey: string; type?: string; dir?: "ltr" }> = [
    { key: "brandName", labelKey: "fieldBrandName" },
    { key: "activeIngredient", labelKey: "fieldActiveIngredient" },
    { key: "registrationNo", labelKey: "fieldRegistrationNo", dir: "ltr" },
    { key: "expiryDate", labelKey: "fieldExpiryDate", type: "date", dir: "ltr" },
  ];

  const similarity = result.matchedProduct ? similarityPercent(result.matchedProduct.similarity) : 0;

  return (
    <div className="space-y-4">
      <p role="status" aria-live="polite" className="sr-only">
        {t("resultReady")}
      </p>

      <div className="space-y-4 lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start lg:gap-5 lg:space-y-0">
        <div className="space-y-4 lg:sticky lg:top-20">
          {/* Hero verdict */}
          <section
            aria-labelledby="dc-verdict-title"
            className="dc-view-in relative isolate overflow-hidden rounded-3xl p-4 text-white shadow-[0_14px_36px_rgb(0_0_0/18%)] sm:p-5"
            style={{ backgroundImage: tone.gradient }}
          >
            <div aria-hidden="true" className="dc-hero-pattern pointer-events-none absolute inset-0 -z-10 opacity-70" />
            <div aria-hidden="true" className="dc-glow pointer-events-none absolute -end-10 -top-10 -z-10 size-48 rounded-full bg-white/20 blur-2xl" />
            {p.showDemoBadge && (
              <div className="mb-3 inline-flex items-center gap-2 rounded-lg border-2 border-[#ffe14d] bg-[#111] px-3 py-1.5 text-sm font-black tracking-wide text-[#ffe14d]">
                {t("demoBadge")}
              </div>
            )}
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="relative grid size-14 shrink-0 place-items-center">
                <span aria-hidden="true" className="dc-halo absolute inset-0 rounded-2xl bg-white/40" />
                <span key={result.id} className="dc-pop relative grid size-14 place-items-center rounded-2xl bg-white/20 text-white ring-1 ring-white/50 backdrop-blur-sm">
                  <GlyphIcon kind={p.icon} className="size-8" />
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold uppercase tracking-wide text-white">{t("verdictWord")}</p>
                <h2 id="dc-verdict-title" ref={headingRef} tabIndex={-1} className="text-xl font-extrabold leading-snug outline-none sm:text-2xl">
                  {t(p.titleKey)}
                </h2>
              </div>
              {result.verdict !== "UNREADABLE" && (
                <RiskRing key={result.id} score={score} label={t("scoreLabel")} outOf={t("scoreOutOf")} color="#ffffff" />
              )}
            </div>
            <p className="mt-3 text-sm font-semibold leading-6">{t(p.summaryKey)}</p>
            {p.showDemoBadge && <p className="mt-2 text-xs font-bold">{t("demoBadgeNote")}</p>}
            {result.explanation && result.language === lang && (
              <p className="mt-3 rounded-xl bg-black/20 p-3 text-sm leading-6">{result.explanation}</p>
            )}
            {p.showRetake && (
              <div className="mt-4">
                <button
                  type="button"
                  onClick={onRetake}
                  className="dc-press dc-focus inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-sm font-extrabold text-brand-dark shadow-sm hover:bg-brand-soft"
                >
                  <GlyphIcon kind="camera" className="size-5" /> {t("retake")}
                </button>
              </div>
            )}
            <p className="mt-4 flex items-center gap-2 rounded-xl bg-black/25 px-3 py-2 text-xs font-extrabold">
              <GlyphIcon kind="info" className="size-4 shrink-0" />
              <span>{t("disclaimerShort")}</span>
            </p>
          </section>

          {/* Product */}
          <section aria-labelledby="dc-product-title" className="card dc-rise space-y-3 p-4" style={rise(1)}>
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
                  <p className="mt-2 flex items-center justify-between gap-3 text-xs font-bold text-brand-dark">
                    <span>{t("matchConfidence")}</span>
                    <span dir="ltr">{similarity}%</span>
                  </p>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-border" aria-hidden="true">
                    <div className="dc-bar h-full rounded-full bg-brand" style={{ width: `${similarity}%` }} />
                  </div>
                </>
              ) : (
                <p className="mt-1 text-sm font-semibold">{t("noMatch")}</p>
              )}
            </div>
          </section>
        </div>

        <div className="space-y-4">
          {/* What we read */}
          <section aria-labelledby="dc-read-title" className="card dc-rise space-y-3 p-4" style={rise(2)}>
            <div>
              <h3 id="dc-read-title" className="text-sm font-extrabold text-brand-dark">
                {t("whatWeRead")}
              </h3>
              <p className="mt-1 text-xs text-muted">{t("whatWeReadHint")}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {editable.map((field) => {
                const dirty = fields[field.key].trim() !== original[field.key].trim();
                return (
                  <label
                    key={field.key}
                    className={`rounded-xl border p-2 text-xs font-bold text-muted transition-colors focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/20 ${
                      dirty ? "border-brand bg-brand-soft/30" : "border-border bg-white"
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span>{t(field.labelKey)}</span>
                      {dirty ? (
                        <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-extrabold text-white">{t("editedTag")}</span>
                      ) : (
                        <GlyphIcon kind="edit" className="size-3.5 text-muted" />
                      )}
                    </span>
                    <input
                      type={field.type ?? "text"}
                      dir={field.dir}
                      value={fields[field.key]}
                      placeholder={t("notRead")}
                      maxLength={160}
                      onChange={(e) => setField(field.key, e.target.value)}
                      className={`${inputClass} mt-1 !min-h-11 border-0 bg-surface-soft`}
                    />
                  </label>
                );
              })}
            </div>
            <dl className="grid grid-cols-2 gap-2">
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
          <section aria-labelledby="dc-checks-title" className="card dc-rise p-4" style={rise(3)}>
            <h3 id="dc-checks-title" className="text-sm font-extrabold text-brand-dark">
              {t("checksTitle")}
            </h3>
            {counts.length > 0 && (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {counts.map(({ status, n }) => (
                  <span
                    key={status}
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${statusMeta[status].chip}`}
                  >
                    <GlyphIcon kind={statusMeta[status].icon} className="size-3" />
                    <span dir="ltr">{n}</span> {t(statusMeta[status].labelKey)}
                  </span>
                ))}
              </p>
            )}
            {checks.length === 0 ? (
              <p className="mt-2 text-sm text-muted">{t("noChecks")}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {checks.map((check, index) => {
                  const meta = statusMeta[check.status] ?? statusMeta.unknown;
                  const text = checkText(check, lang);
                  const expandable = Boolean(text.detail);
                  const open = check.code in openChecks ? openChecks[check.code] : check.status === "fail";
                  const panelId = `${idBase}-check-${index}`;
                  const head = (
                    <>
                      <span className={`grid size-8 shrink-0 place-items-center rounded-full ${meta.chip}`}>
                        <GlyphIcon kind={meta.icon} className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1 text-sm font-extrabold">
                        <span className="me-2 text-xs font-extrabold uppercase text-muted">{t(meta.labelKey)}</span>
                        {text.title}
                      </span>
                    </>
                  );
                  return (
                    <li
                      key={check.code}
                      className={`dc-rise rounded-xl border border-s-4 border-border bg-white ${meta.border}`}
                      style={rise(Math.min(4 + index, 12))}
                    >
                      {expandable ? (
                        <>
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={panelId}
                            onClick={() => setOpenChecks((m) => ({ ...m, [check.code]: !open }))}
                            className="dc-focus flex min-h-12 w-full items-center gap-3 rounded-xl p-3 text-start"
                          >
                            {head}
                            <GlyphIcon kind="chevron" className="dc-chevron size-4 shrink-0 text-muted" />
                          </button>
                          <div id={panelId} className="dc-collapse" data-open={open}>
                            <div>
                              <p className="px-3 pb-3 ps-14 text-xs leading-5 text-muted">{text.detail}</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className="flex min-h-12 items-center gap-3 p-3">{head}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* How we scored this */}
          <section aria-labelledby="dc-how-title" className="card dc-rise p-3" style={rise(5)}>
            <h3 id="dc-how-title" className="text-sm font-extrabold text-brand-dark">
              <button
                type="button"
                aria-expanded={howOpen}
                aria-controls={`${idBase}-how`}
                onClick={() => setHowOpen((v) => !v)}
                className="dc-focus flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-start"
              >
                <span className="flex items-center gap-2">
                  <GlyphIcon kind="info" className="size-4" /> {t("howTitle")}
                </span>
                <GlyphIcon kind="chevron" className="dc-chevron size-5 shrink-0" />
              </button>
            </h3>
            <div id={`${idBase}-how`} className="dc-collapse" data-open={howOpen}>
              <div>
                <p className="pt-2 text-xs leading-5 text-muted">{t("howIntro")}</p>
                <ul className="mt-2 space-y-1.5 pb-1 text-sm">
                  {howKeys.map((key) => (
                    <li key={key} className="flex gap-2">
                      <GlyphIcon kind="check" className="mt-0.5 size-4 shrink-0 text-brand" />
                      <span>{t(key)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>

          {/* Next steps */}
          <section aria-labelledby="dc-next-title" className="card dc-rise p-4" style={rise(6)}>
            <h3 id="dc-next-title" className="text-sm font-extrabold text-brand-dark">
              {t("nextStepsTitle")}
            </h3>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {p.nextStepKeys.map((key) => (
                <li key={key} className="flex items-start gap-3 rounded-xl border border-border bg-surface-soft/60 p-3 text-sm">
                  <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand-dark">
                    <GlyphIcon kind={stepIcons[key] ?? "check"} className="size-5" />
                  </span>
                  <span className="pt-1.5 font-semibold">{t(key)}</span>
                </li>
              ))}
            </ul>
            <Link href="/consultations" className={`${secondaryButton} mt-4 w-full sm:w-auto`}>
              <GlyphIcon kind="expert" className="size-5" /> {t("expertLink")}
            </Link>
          </section>

          <Disclaimer t={t} />
        </div>
      </div>

      <div className="sticky bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-30 -mx-4 border-t border-border bg-white/95 p-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 lg:bottom-0">
        <p
          role="status"
          aria-live="polite"
          className={
            copyState === "idle"
              ? "sr-only"
              : `dc-view-in pointer-events-none absolute inset-x-0 -top-11 mx-auto w-fit max-w-[90%] rounded-full px-4 py-2 text-xs font-extrabold text-white shadow-lg sm:static sm:mb-2 sm:mx-0 sm:shadow-none ${copyState === "ok" ? "bg-brand" : "bg-danger"}`
          }
        >
          {copyState === "ok" ? t("copied") : copyState === "fail" ? t("copyFailed") : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onNew} className={`${primaryButton} min-w-0 flex-1 sm:flex-none`}>
            <GlyphIcon kind="camera" className="size-5" /> {t("newCheck")}
          </button>
          {speech.supported && (
            <button
              type="button"
              aria-pressed={speech.speaking}
              aria-label={t("listenAria")}
              onClick={() => (speech.speaking ? speech.stop() : speech.speak(buildSpeechText(result, lang, t), lang))}
              className={`${secondaryButton} !px-3 sm:!px-5 ${speech.speaking ? "!bg-brand-soft" : ""}`}
            >
              <GlyphIcon kind="speaker" className="size-5" />
              <span className="hidden sm:inline">{speech.speaking ? t("stopListening") : t("listen")}</span>
            </button>
          )}
          <button
            type="button"
            aria-label={t("copySummary")}
            title={t("copySummary")}
            onClick={() => void copySummary()}
            className={`${secondaryButton} !px-3 sm:!px-5`}
          >
            <GlyphIcon kind="copy" className="size-5" />
            <span className="hidden sm:inline">{t("copySummary")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
