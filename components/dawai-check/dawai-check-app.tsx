"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
  createCheck,
  createManualCheck,
  DawaiError,
  getCheck,
  listChecks,
  uploadLabelPhoto,
} from "@/features/dawai-check/client";
import { buildManualPayload, emptyFields, parsePrice, type EditableFields } from "@/features/dawai-check/manual";
import { formatHistory, type HistoryRow } from "@/features/dawai-check/history";
import { translate } from "@/features/dawai-check/strings";
import type { Lang, PesticideCheckResult } from "@/features/dawai-check/types";
import { AnalysingPanel, type AnalysisStage } from "./analysing-panel";
import { CapturePanel, type PhotoState } from "./capture-panel";
import { HistoryPanel } from "./history-panel";
import { ManualPanel } from "./manual-panel";
import { Disclaimer, ErrorBanner, GlyphIcon } from "./parts";
import { ResultView } from "./result-view";

type Tab = "check" | "history";
type View = "capture" | "manual" | "analysing" | "result";

const LANG_KEY = "fg-dawai-lang";

function subscribeOnline(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

function readStoredLang(): Lang | null {
  try {
    const value = window.localStorage.getItem(LANG_KEY);
    return value === "ur" || value === "en" ? value : null;
  } catch {
    return null;
  }
}

export function DawaiCheckApp() {
  const [lang, setLang] = useState<Lang>("en");
  const [tab, setTab] = useState<Tab>("check");
  const [view, setView] = useState<View>("capture");
  const [stage, setStage] = useState<AnalysisStage>("uploading");
  const [withUpload, setWithUpload] = useState(true);
  const [photo, setPhoto] = useState<PhotoState | null>(null);
  const [price, setPrice] = useState("");
  const [packSize, setPackSize] = useState("");
  const [manualFields, setManualFields] = useState<EditableFields>(emptyFields);
  const [result, setResult] = useState<PesticideCheckResult | null>(null);
  const [error, setError] = useState("");
  const [rechecking, setRechecking] = useState(false);
  const [recheckError, setRecheckError] = useState("");
  const [history, setHistory] = useState<{ rows: HistoryRow[]; loading: boolean; error: string }>({
    rows: [],
    loading: false,
    error: "",
  });
  const [opening, setOpening] = useState(false);
  const mediaIdRef = useRef<{ file: File; id: string } | null>(null);
  const runRef = useRef(0);
  const online = useOnline();
  const t = useCallback((key: string) => translate(lang, key), [lang]);

  useEffect(() => {
    const stored = readStoredLang();
    if (stored && stored !== "en") {
      const id = window.setTimeout(() => setLang(stored), 0);
      return () => window.clearTimeout(id);
    }
  }, []);

  function changeLang(next: Lang): void {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_KEY, next);
    } catch {
      /* storage unavailable */
    }
  }

  const messageFor = useCallback(
    (cause: unknown): string => {
      if (cause instanceof DawaiError) {
        switch (cause.kind) {
          case "offline":
            return t("errOffline");
          case "unavailable":
            return t("errUnavailable");
          case "auth":
            return t("errAuth");
          case "upload":
            return t("errUpload");
          case "invalid":
            return t("errInvalid");
        }
      }
      return t("errGeneric");
    },
    [t],
  );

  function clearPhoto(): void {
    if (photo) URL.revokeObjectURL(photo.previewUrl);
    setPhoto(null);
    mediaIdRef.current = null;
    setError("");
  }

  function reset(): void {
    runRef.current++;
    clearPhoto();
    setResult(null);
    setError("");
    setRecheckError("");
    setPrice("");
    setPackSize("");
    setManualFields(emptyFields);
    setView("capture");
    setTab("check");
  }

  async function submitPhoto(): Promise<void> {
    if (!photo) return;
    const run = ++runRef.current;
    setError("");
    setWithUpload(true);
    setStage("uploading");
    setView("analysing");
    try {
      let cached = mediaIdRef.current;
      if (!cached || cached.file !== photo.file) {
        cached = { file: photo.file, id: await uploadLabelPhoto(photo.file) };
        mediaIdRef.current = cached;
      }
      if (run !== runRef.current) return;
      setStage("analysing");
      const priceRs = parsePrice(price);
      const pack = packSize.trim();
      const next = await createCheck({
        mediaAssetId: cached.id,
        language: lang,
        ...(priceRs !== undefined ? { priceRs } : {}),
        ...(pack ? { packSize: pack } : {}),
      });
      if (run !== runRef.current) return;
      setResult(next);
      setRecheckError("");
      setView("result");
    } catch (cause) {
      if (run !== runRef.current) return;
      setError(messageFor(cause));
      setView("capture");
    }
  }

  async function submitManual(): Promise<void> {
    const built = buildManualPayload(manualFields, lang, parsePrice(price));
    if (!built.ok) {
      setError(t("errBrandRequired"));
      return;
    }
    const run = ++runRef.current;
    setError("");
    setWithUpload(false);
    setStage("analysing");
    setView("analysing");
    try {
      const next = await createManualCheck(built.payload);
      if (run !== runRef.current) return;
      setResult(next);
      setRecheckError("");
      setView("result");
    } catch (cause) {
      if (run !== runRef.current) return;
      setError(messageFor(cause));
      setView("manual");
    }
  }

  async function recheck(fields: EditableFields): Promise<void> {
    const built = buildManualPayload(fields, lang, parsePrice(price));
    if (!built.ok) {
      setRecheckError(t("errBrandRequired"));
      return;
    }
    const run = ++runRef.current;
    setRechecking(true);
    setRecheckError("");
    try {
      const next = await createManualCheck(built.payload);
      if (run === runRef.current) setResult(next);
    } catch (cause) {
      if (run === runRef.current) setRecheckError(messageFor(cause));
    } finally {
      if (run === runRef.current) setRechecking(false);
    }
  }

  const loadHistory = useCallback(async (): Promise<void> => {
    setHistory((h) => ({ ...h, loading: true, error: "" }));
    try {
      const items = await listChecks();
      setHistory({ rows: formatHistory(items, lang), loading: false, error: "" });
    } catch (cause) {
      setHistory((h) => ({ ...h, loading: false, error: messageFor(cause) }));
    }
  }, [lang, messageFor]);

  function openTab(next: Tab): void {
    setTab(next);
    if (next === "history") void loadHistory();
  }

  async function openHistoryItem(id: string): Promise<void> {
    setOpening(true);
    setHistory((h) => ({ ...h, error: "" }));
    try {
      const next = await getCheck(id);
      setResult(next);
      setRecheckError("");
      setView("result");
      setTab("check");
    } catch (cause) {
      setHistory((h) => ({ ...h, error: messageFor(cause) }));
    } finally {
      setOpening(false);
    }
  }

  const dir = lang === "ur" ? "rtl" : "ltr";
  const tabClass = (active: boolean) =>
    `min-h-11 flex-1 rounded-xl px-3 text-sm font-extrabold transition ${active ? "bg-brand text-white shadow-sm" : "text-brand-dark hover:bg-brand-soft/60"}`;

  return (
    <div className="page-container">
      <div lang={lang} dir={dir} className="mx-auto max-w-3xl space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-bold text-success">
              <GlyphIcon kind="pill" className="size-4" />
              <span>FasalGuard AI</span>
            </p>
            <h1 className="mt-1 text-2xl font-extrabold text-foreground sm:text-3xl">{t("title")}</h1>
            <p className="mt-1 text-sm text-muted">{t("subtitle")}</p>
          </div>
          <div role="group" aria-label={t("langToggleAria")} className="flex shrink-0 overflow-hidden rounded-xl border border-brand/30 bg-white">
            <button
              type="button"
              lang="ur"
              aria-pressed={lang === "ur"}
              onClick={() => changeLang("ur")}
              className={`min-h-11 min-w-14 px-3 text-sm font-extrabold ${lang === "ur" ? "bg-brand text-white" : "text-brand-dark"}`}
            >
              اردو
            </button>
            <button
              type="button"
              lang="en"
              aria-pressed={lang === "en"}
              onClick={() => changeLang("en")}
              className={`min-h-11 min-w-14 px-3 text-sm font-extrabold ${lang === "en" ? "bg-brand text-white" : "text-brand-dark"}`}
            >
              English
            </button>
          </div>
        </header>

        {!online && (
          <p role="status" className="flex items-center gap-2 rounded-2xl border border-warning bg-[#fff6e2] p-3 text-sm font-bold text-[#7a4300]">
            <GlyphIcon kind="alert" className="size-5 shrink-0" /> {t("offlineBanner")}
          </p>
        )}

        <nav aria-label={t("title")} className="flex gap-1 rounded-2xl border border-border bg-white p-1">
          <button type="button" aria-current={tab === "check" ? "page" : undefined} onClick={() => openTab("check")} className={tabClass(tab === "check")}>
            {t("tabCheck")}
          </button>
          <button type="button" aria-current={tab === "history" ? "page" : undefined} onClick={() => openTab("history")} className={tabClass(tab === "history")}>
            {t("tabHistory")}
          </button>
        </nav>

        <div className="min-h-[40vh]">
          {tab === "history" ? (
            <HistoryPanel
              t={t}
              rows={history.rows}
              loading={history.loading || opening}
              error={history.error}
              onRetry={() => void loadHistory()}
              onOpen={(id) => void openHistoryItem(id)}
              onNew={() => openTab("check")}
            />
          ) : view === "analysing" ? (
            <AnalysingPanel t={t} stage={stage} withUpload={withUpload} />
          ) : view === "result" && result ? (
            <ResultView
              t={t}
              lang={lang}
              result={result}
              rechecking={rechecking}
              recheckError={recheckError}
              offline={!online}
              onRecheck={(fields) => void recheck(fields)}
              onNew={reset}
              onRetake={reset}
            />
          ) : view === "manual" ? (
            <ManualPanel
              t={t}
              fields={manualFields}
              onFields={setManualFields}
              onSubmit={() => void submitManual()}
              onBack={() => {
                setError("");
                setView("capture");
              }}
              error={error}
              offline={!online}
            />
          ) : (
            <>
              <div role="group" aria-label={t("modeAria")} className="mb-4 flex gap-1 rounded-2xl bg-surface-soft p-1">
                <button type="button" aria-pressed className={tabClass(true)}>
                  {t("modePhoto")}
                </button>
                <button
                  type="button"
                  aria-pressed={false}
                  onClick={() => {
                    setError("");
                    setView("manual");
                  }}
                  className={tabClass(false)}
                >
                  {t("modeManual")}
                </button>
              </div>
              <CapturePanel
                t={t}
                photo={photo}
                onPhoto={(next) => {
                  if (photo) URL.revokeObjectURL(photo.previewUrl);
                  mediaIdRef.current = null;
                  setError("");
                  setPhoto(next);
                }}
                onClear={clearPhoto}
                price={price}
                onPrice={setPrice}
                packSize={packSize}
                onPackSize={setPackSize}
                onSubmit={() => void submitPhoto()}
                onManual={() => {
                  setError("");
                  setView("manual");
                }}
                error={error}
                offline={!online}
              />
            </>
          )}
        </div>

        {view !== "result" && <Disclaimer t={t} />}
        {error && view === "analysing" && <ErrorBanner message={error} />}
      </div>
    </div>
  );
}
