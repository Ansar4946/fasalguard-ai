"use client";

import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
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
import { Disclaimer, Emblem, ErrorBanner, GlyphIcon, Segmented } from "./parts";
import { ResultView } from "./result-view";

type Tab = "check" | "history";
type View = "capture" | "manual" | "analysing" | "result";
type Mode = "photo" | "manual";

const LANG_KEY = "fg-dawai-lang";
const COVERAGE_KEY = "fg-dawai-coverage";

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
  const [demoNote, setDemoNote] = useState(false);
  // Which reference lists the API used last time (cached so the header chip is right before the first check of a visit).
  const [seenDemo, setSeenDemo] = useState(false);
  const mediaIdRef = useRef<{ file: File; id: string } | null>(null);
  const runRef = useRef(0);
  const online = useOnline();
  const demoNoteId = useId();
  const t = useCallback((key: string) => translate(lang, key), [lang]);

  useEffect(() => {
    const stored = readStoredLang();
    if (stored && stored !== "en") {
      const id = window.setTimeout(() => setLang(stored), 0);
      return () => window.clearTimeout(id);
    }
  }, []);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(COVERAGE_KEY) === "DEMO") {
        const id = window.setTimeout(() => setSeenDemo(true), 0);
        return () => window.clearTimeout(id);
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const resultCoverage = result?.listCoverage;
  useEffect(() => {
    if (!resultCoverage) return;
    try {
      window.localStorage.setItem(COVERAGE_KEY, resultCoverage);
    } catch {
      /* storage unavailable */
    }
  }, [resultCoverage]);

  // DEMO chip when a demo row influenced the result or the API only has the demo lists; otherwise the DPP chip.
  const chipDemo = result ? Boolean(result.demoDataset) || result.listCoverage !== "DPP_PARTIAL" : seenDemo;
  const chipKey = chipDemo ? "demoChip" : "dppChip";

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

  function chooseMode(next: Mode): void {
    setError("");
    setView(next === "manual" ? "manual" : "capture");
  }

  const dir = lang === "ur" ? "rtl" : "ltr";
  const wide = tab === "check" && view === "result" && Boolean(result);
  const showModes = tab === "check" && (view === "capture" || view === "manual");

  return (
    <div className="page-container">
      <div lang={lang} dir={dir} className={`mx-auto space-y-3 transition-[max-width] duration-300 ${wide ? "max-w-5xl" : "max-w-2xl"}`}>
        <header
          className="relative isolate overflow-hidden rounded-3xl p-3.5 text-white shadow-[0_12px_30px_rgb(3_69_44/28%)] sm:p-6"
          style={{ backgroundImage: "linear-gradient(135deg, #075f3d 0%, #04472e 52%, #022b1b 100%)" }}
        >
          <div aria-hidden="true" className="dc-hero-pattern pointer-events-none absolute inset-0 -z-10" />
          <div aria-hidden="true" className="dc-glow pointer-events-none absolute -end-12 -top-16 -z-10 size-56 rounded-full bg-[#7ee2a8]/30 blur-3xl" />
          <div aria-hidden="true" className="pointer-events-none absolute -bottom-10 start-1/4 -z-10 size-40 rounded-full bg-[#d9f5c7]/10 blur-3xl" />
          <div className="flex items-center gap-3">
            <span className="dc-float grid size-14 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/25 backdrop-blur-sm">
              <Emblem className="size-10" />
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-[#d9f5c7]">
                <GlyphIcon kind="pill" className="size-3.5" />
                <span>FasalGuard AI</span>
              </p>
              <h1 className="text-2xl font-extrabold leading-tight sm:text-3xl">{t("title")}</h1>
            </div>
          </div>
          <p className="mt-2 max-w-xl text-sm font-medium leading-5 text-white">{t("subtitle")}</p>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              aria-expanded={demoNote}
              aria-controls={demoNoteId}
              aria-label={`${t(chipKey)}. ${t(chipDemo ? "demoChipAria" : "dppChipAria")}`}
              onClick={() => setDemoNote((v) => !v)}
              className={
                chipDemo
                  ? "dc-press dc-focus inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#ffe14d] bg-[#111] px-3 text-xs font-black tracking-wide text-[#ffe14d]"
                  : "dc-press dc-focus inline-flex min-h-11 items-center gap-2 rounded-full border-2 border-[#d9f5c7] bg-[#0b2e20] px-3 text-xs font-black tracking-wide text-[#d9f5c7]"
              }
            >
              <GlyphIcon kind="info" className="size-4" />
              {t(chipKey)}
            </button>
            <Segmented<Lang>
              onDark
              compact
              mode="toggle"
              ariaLabel={t("langToggleAria")}
              value={lang}
              onChange={changeLang}
              options={[
                { value: "ur", label: "اردو", lang: "ur" },
                { value: "en", label: "English", lang: "en" },
              ]}
            />
          </div>
          <div id={demoNoteId} className="dc-collapse" data-open={demoNote}>
            <div>
              <p className="mt-3 rounded-xl bg-black/25 p-3 text-xs font-semibold leading-5">{t(chipDemo ? "demoChipNote" : "dppChipNote")}</p>
            </div>
          </div>
        </header>

        {!online && (
          <p role="status" className="flex items-center gap-2 rounded-2xl border border-warning bg-[#fff6e2] p-3 text-sm font-bold text-[#7a4300]">
            <GlyphIcon kind="alert" className="size-5 shrink-0" /> {t("offlineBanner")}
          </p>
        )}

        <nav aria-label={t("title")}>
          <Segmented<Tab>
            mode="tabs"
            ariaLabel={t("title")}
            value={tab}
            onChange={openTab}
            options={[
              { value: "check", label: t("tabCheck"), icon: "scan" },
              { value: "history", label: t("tabHistory"), icon: "history" },
            ]}
          />
        </nav>

        <div className="min-h-[40vh]">
          <div>
            {tab === "history" ? (
              <div key="history" className="dc-view-in">
              <HistoryPanel
                t={t}
                rows={history.rows}
                loading={history.loading || opening}
                error={history.error}
                onRetry={() => void loadHistory()}
                onOpen={(id) => void openHistoryItem(id)}
                onNew={() => openTab("check")}
              />
              </div>
            ) : view === "analysing" ? (
              <div key="analysing" className="dc-view-in">
              <AnalysingPanel
                t={t}
                stage={stage}
                withUpload={withUpload}
                photoUrl={withUpload ? photo?.previewUrl : undefined}
                subject={withUpload ? undefined : manualFields.brandName}
              />
              </div>
            ) : view === "result" && result ? (
              <div key="result" className="dc-view-in">
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
              </div>
            ) : (
              <div className="space-y-4">
                {showModes && (
                  <Segmented<Mode>
                    mode="toggle"
                    ariaLabel={t("modeAria")}
                    value={view === "manual" ? "manual" : "photo"}
                    onChange={chooseMode}
                    options={[
                      { value: "photo", label: t("modePhoto"), icon: "camera" },
                      { value: "manual", label: t("modeManual"), icon: "type" },
                    ]}
                  />
                )}
                <div key={view} className="dc-view-in">
                {view === "manual" ? (
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
                )}
                </div>
              </div>
            )}
          </div>
        </div>

        {view !== "result" && <Disclaimer t={t} />}
        {error && view === "analysing" && <ErrorBanner message={error} />}
      </div>
    </div>
  );
}
