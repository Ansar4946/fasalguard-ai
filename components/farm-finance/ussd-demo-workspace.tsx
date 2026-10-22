"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { FarmLedgerEntry, UssdDemoResponse } from "@/features/farm-finance/types";
import { ConsentSheet } from "./ussd/ConsentSheet";
import { Dialer } from "./ussd/Dialer";
import { ExplainCard } from "./ussd/ExplainCard";
import { LedgerCard, type LedgerState } from "./ussd/LedgerCard";
import { PhoneFrame } from "./ussd/PhoneFrame";
import { PinCard } from "./ussd/PinCard";
import type { ReceiptView } from "./ussd/ReceiptCard";
import { StatusBar } from "./ussd/StatusBar";
import { UssdOverlay } from "./ussd/UssdOverlay";
import {
  appendDialKey,
  appendReplyDigit,
  extractReceiptId,
  matchDialedCode,
  pasteIntoDial,
  removeLastDialKey,
  unrecognisedCodeMessage,
  newUuid,
  parseLedgerPayload,
  parseReviewScreen,
  parseUssdResponse,
  verifyReceipt,
  type ExpectedExpense,
} from "@/features/farm-finance/ussd-formatters";

type ErrorBody = { error?: { message?: string } };
type PendingRequest = { eventId: string; sessionId: string; input: string };

type VerifyState = "none" | "checking" | "verified" | "missing" | "mismatch";

class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function responseMessage(response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as ErrorBody;
  return body.error?.message ?? "The request could not be completed.";
}

async function fetchLedger(): Promise<FarmLedgerEntry[]> {
  const response = await fetch("/api/farm-ledger", { cache: "no-store" });
  if (!response.ok) throw new HttpError(await responseMessage(response), response.status);
  return parseLedgerPayload(await response.json().catch(() => null));
}

type LedgerOutcome =
  | { ok: true; entries: FarmLedgerEntry[] }
  | { ok: false; unauthorized: boolean; message: string };

async function settleLedger(): Promise<LedgerOutcome> {
  try {
    return { ok: true, entries: await fetchLedger() };
  } catch (reason) {
    const unauthorized = reason instanceof HttpError && reason.status === 401;
    return {
      ok: false,
      unauthorized,
      message: reason instanceof Error ? reason.message : "Ledger unavailable.",
    };
  }
}

function nextLedgerState(current: LedgerState, outcome: LedgerOutcome): LedgerState {
  if (outcome.ok) return { status: "ready", entries: outcome.entries };
  // Never keep another account's financial data on screen after the session ends.
  if (outcome.unauthorized)
    return { status: "unauthorized", entries: null, message: "Your session has ended. Sign in again to see your ledger." };
  // A transient failure keeps the last good records but is always shown as an error, never as empty.
  return { status: "error", entries: current.entries, message: outcome.message };
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const VERIFY_ATTEMPTS = 3;
const VERIFY_DELAY_MS = 800;
function receiptMessage(status: VerifyState, reason: string | null): string {
  switch (status) {
    case "verified":
      return "Saved and verified: the ledger holds this exact receipt with the confirmed amount.";
    case "checking":
      return "Receipt received; checking the ledger…";
    case "mismatch":
      return `Receipt found, but its ${reason ?? "details"} does not match what you confirmed. Do not rely on it; contact support.`;
    default:
      return "Receipt received, but it is not yet visible in your ledger. Use Refresh to check again before relying on it.";
  }
}

export function UssdDemoWorkspace() {
  const [acknowledged, setAcknowledged] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [screen, setScreen] = useState("");
  const [input, setInput] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [ledgerState, setLedgerState] = useState<LedgerState>({ status: "loading", entries: null });
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptStatus, setReceiptStatus] = useState<VerifyState>("none");
  const [mismatchReason, setMismatchReason] = useState<string | null>(null);
  const [pinMessage, setPinMessage] = useState<string | null>(null);
  const [dialed, setDialed] = useState("");
  const [consentOpen, setConsentOpen] = useState(true);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const sessionRef = useRef<string | null>(null);
  const screenRef = useRef<HTMLPreElement>(null);
  const reviewRef = useRef<ExpectedExpense | null>(null);
  const mountedRef = useRef(true);
  const requestRef = useRef(0);

  /**
   * Only the newest request may update state, so a slow earlier response cannot overwrite a
   * later one, and nothing is applied after unmount.
   */
  const loadLedger = useCallback(async (): Promise<FarmLedgerEntry[] | null> => {
    const ticket = ++requestRef.current;
    const outcome = await settleLedger();
    if (!mountedRef.current || ticket !== requestRef.current) return null;
    setLedgerState((current) => nextLedgerState(current, outcome));
    return outcome.ok ? outcome.entries : null;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const ticket = ++requestRef.current;
    void settleLedger().then((outcome) => {
      if (!mountedRef.current || ticket !== requestRef.current) return;
      setLedgerState((current) => nextLedgerState(current, outcome));
    });
    return () => {
      mountedRef.current = false;
    };
  }, []);

  function retryLedger() {
    setLedgerState((current) => ({ status: "retrying", entries: current.entries }));
    void loadLedger();
  }

  async function verifyConfirmedReceipt(receipt: string, expected: ExpectedExpense | null) {
    setReceiptStatus("checking");
    setMismatchReason(null);
    for (let attempt = 0; attempt < VERIFY_ATTEMPTS; attempt += 1) {
      if (attempt > 0) await wait(VERIFY_DELAY_MS);
      if (!mountedRef.current) return;
      const entries = await loadLedger();
      if (!mountedRef.current) return;
      if (!entries) break;
      const result = verifyReceipt(entries, receipt, expected);
      if (result.kind === "verified") return setReceiptStatus("verified");
      if (result.kind === "mismatch") {
        setMismatchReason(result.reason);
        return setReceiptStatus("mismatch");
      }
    }
    setReceiptStatus("missing");
  }

  async function send(payload: PendingRequest) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/ussd-demo/session", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) throw new HttpError(await responseMessage(response), response.status);
      const body = (await response.json()) as UssdDemoResponse;
      if (typeof body.text !== "string") throw new Error("The simulator response was malformed.");
      // The farmer cancelled or restarted while this request was in flight: drop the stale answer.
      if (sessionRef.current !== payload.sessionId) return;
      const parsed = parseUssdResponse(body.text);
      const review = parseReviewScreen(body.text);
      if (review) reviewRef.current = review;
      setScreen(parsed.content);
      setActive(parsed.mode === "continue");
      setInput("");
      setPending(null);
      const receipt = extractReceiptId(body.text);
      setReceiptId(receipt);
      if (receipt) {
        await verifyConfirmedReceipt(receipt, reviewRef.current);
      } else {
        setReceiptStatus("none");
      }
      if (parsed.mode === "end") reviewRef.current = null;
      requestAnimationFrame(() => screenRef.current?.focus());
    } catch (reason) {
      if (sessionRef.current !== payload.sessionId) return;
      if (reason instanceof HttpError && reason.status === 401) {
        setActive(false);
        setPending(null);
        setError("Your session has expired. Sign in again; no expense was saved by this step.");
        return;
      }
      setPending(payload);
      setError(reason instanceof Error ? reason.message : "Network unavailable. Retry the same step.");
    } finally {
      if (sessionRef.current === payload.sessionId || sessionRef.current === null) setBusy(false);
    }
  }

  async function start() {
    if (!acknowledged) {
      setConsentOpen(true);
      return;
    }
    const nextSession = newUuid();
    sessionRef.current = nextSession;
    setSessionId(nextSession);
    setScreen("");
    setOverlayOpen(true);
    setInput("");
    setPending(null);
    setReceiptId(null);
    setReceiptStatus("none");
    reviewRef.current = null;
    await send({ eventId: newUuid(), sessionId: nextSession, input: "" });
  }

  async function call() {
    if (busy || overlayOpen) return;
    if (!acknowledged) {
      setConsentOpen(true);
      return;
    }
    const match = matchDialedCode(dialed);
    if (match === "empty") return;
    setError(null);
    if (match === "unrecognised") {
      sessionRef.current = null;
      setActive(false);
      setReceiptId(null);
      setScreen(unrecognisedCodeMessage());
      setOverlayOpen(true);
      return;
    }
    setDialed("");
    await start();
  }

  function cancelSession() {
    sessionRef.current = null;
    setOverlayOpen(false);
    setActive(false);
    setPending(null);
    setError(null);
    setInput("");
    setBusy(false);
    reviewRef.current = null;
  }

  function pressKey(key: string) {
    if (overlayOpen) {
      if (active && !busy) setInput((value) => appendReplyDigit(value, key));
      return;
    }
    setError(null);
    setDialed((value) => appendDialKey(value, key));
  }

  function pressBackspace() {
    if (overlayOpen) setInput((value) => value.slice(0, -1));
    else setDialed(removeLastDialKey);
  }

  function pressClear() {
    if (overlayOpen) setInput("");
    else setDialed("");
  }

  function primary() {
    if (overlayOpen) {
      if (active && !busy && sessionId) void send({ eventId: newUuid(), sessionId, input });
    } else {
      void call();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!sessionId || !active || busy) return;
    await send({ eventId: newUuid(), sessionId, input });
  }

  async function setupPin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setPinMessage(null);
    setBusy(true);
    try {
      const response = await fetch("/api/ussd-demo/pin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          currentPassword: data.get("currentPassword"),
          pin: data.get("pin"),
          confirmPin: data.get("confirmPin"),
        }),
      });
      if (!response.ok) throw new Error(await responseMessage(response));
      setPinMessage("PIN configured. You can start the simulator.");
      form.reset();
    } catch (reason) {
      setPinMessage(reason instanceof Error ? reason.message : "PIN setup failed.");
    } finally {
      form.reset();
      setBusy(false);
    }
  }

  const receipt: ReceiptView | null = receiptId
    ? {
        id: receiptId,
        tone: receiptStatus === "verified" ? "verified" : receiptStatus === "mismatch" ? "problem" : "pending",
        message: receiptMessage(receiptStatus, mismatchReason),
      }
    : null;
  const quickStartLabel = sessionId ? "Start new session" : "Start simulator";

  return (
    <div className="mx-auto max-w-6xl space-y-6 sm:p-2 lg:p-6">
      <header className="px-4 sm:px-1">
        <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-brand">Farm finance</p>
        <h1 className="mt-1 text-2xl font-extrabold text-foreground sm:text-3xl">USSD farm expense simulator</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted">Record farm expenses through a low-connectivity USSD menu, using your real farms and crop seasons. Confirmed expenses are stored in your Fasal Guard ledger.</p>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-10">
        <section aria-label="Phone session" className="lg:sticky lg:top-6">
          <PhoneFrame>
            <StatusBar />
            <Dialer
              mode={overlayOpen ? "reply" : "dial"}
              dialed={dialed}
              locked={consentOpen}
              busy={busy}
              primaryDisabled={overlayOpen ? !active || busy : busy || dialed === ""}
              onKey={pressKey}
              onBackspace={pressBackspace}
              onClear={pressClear}
              onPrimary={primary}
              onPaste={(text) => setDialed((value) => pasteIntoDial(value, text))}
              onQuickStart={() => void start()}
              quickStartLabel={quickStartLabel}
              quickStartDisabled={busy || overlayOpen}
            >
              {overlayOpen && (
                <UssdOverlay
                  screen={screen}
                  active={active}
                  busy={busy}
                  error={error}
                  input={input}
                  onInput={setInput}
                  onSend={submit}
                  onCancel={cancelSession}
                  onRetry={pending ? () => void send(pending) : null}
                  receipt={receipt}
                  screenRef={screenRef}
                />
              )}
            </Dialer>
            {consentOpen && (
              <ConsentSheet acknowledged={acknowledged} onAcknowledge={setAcknowledged} onContinue={() => setConsentOpen(false)} />
            )}
          </PhoneFrame>
          {!overlayOpen && error && <p className="mx-4 mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold text-danger sm:mx-0" role="alert">{error}</p>}
        </section>

        <div className="space-y-6 px-4 pb-6 sm:px-0">
          <ExplainCard />
          <PinCard busy={busy} message={pinMessage} onSubmit={setupPin} />
          <LedgerCard state={ledgerState} receiptId={receiptId} onRefresh={retryLedger} />
        </div>
      </div>
    </div>
  );
}
