"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { DEMO_SHORT_CODE, dialAction } from "@/features/farm-finance/ussd-formatters";
import { Keypad } from "./Keypad";
import { haptic } from "./haptics";

const LONG_PRESS_MS = 550;

export interface DialerProps {
  /** "dial" edits the number to call; "reply" feeds digits into the open USSD dialog. */
  mode: "dial" | "reply";
  dialed: string;
  /** Blocks all input (consent sheet open). */
  locked: boolean;
  busy: boolean;
  primaryDisabled: boolean;
  onKey: (key: string) => void;
  onBackspace: () => void;
  onClear: () => void;
  onPrimary: () => void;
  onPaste: (text: string) => void;
  onQuickStart: () => void;
  quickStartLabel: string;
  quickStartDisabled: boolean;
  /** The USSD dialog; rendered over the number display. */
  children?: ReactNode;
}

function isTextTarget(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], a") !== null;
}

function PhoneIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M6.6 10.8a15.2 15.2 0 006.6 6.6l2.2-2.2a1 1 0 011-.25 11.4 11.4 0 003.6.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1c0 1.25.2 2.45.57 3.6a1 1 0 01-.25 1z" />
    </svg>
  );
}

export function Dialer(props: DialerProps) {
  const { mode, dialed, locked, busy, primaryDisabled, onKey, onBackspace, onClear, onPrimary, onPaste, onQuickStart, quickStartLabel, quickStartDisabled, children } = props;
  const latest = useRef(props);
  useEffect(() => {
    latest.current = props;
  });
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const current = latest.current;
      if (current.locked || event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTextTarget(event.target)) return;
      const action = dialAction(event.key);
      if (!action) return;
      const onButton = event.target instanceof Element && event.target.closest("button") !== null;
      if (action.type === "call") {
        if (onButton || current.primaryDisabled) return;
        event.preventDefault();
        current.onPrimary();
      } else if (action.type === "backspace") {
        event.preventDefault();
        current.onBackspace();
      } else {
        event.preventDefault();
        current.onKey(action.key);
      }
    }
    function onDocumentPaste(event: ClipboardEvent) {
      const current = latest.current;
      if (current.locked || current.mode !== "dial" || isTextTarget(event.target)) return;
      const text = event.clipboardData?.getData("text") ?? "";
      if (text) {
        event.preventDefault();
        current.onPaste(text);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onDocumentPaste);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("paste", onDocumentPaste);
    };
  }, []);

  useEffect(() => () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  }, []);

  function startPress() {
    longPressed.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longPressed.current = true;
      haptic(25);
      onClear();
    }, LONG_PRESS_MS);
  }
  function endPress() {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) onPaste(text);
    } catch {
      /* clipboard permission denied: Ctrl+V still works */
    }
  }

  const empty = dialed === "";
  const sizeClass = dialed.length > 14 ? "text-2xl" : dialed.length > 9 ? "text-3xl" : "text-4xl";
  return (
    <div className="relative z-10 flex flex-1 flex-col px-4 pb-5 sm:px-6">
      <div className="relative h-[18rem] shrink-0">
        <div className={`flex h-full flex-col items-center justify-end pb-3 transition-opacity duration-200 ${mode === "reply" ? "opacity-0" : "opacity-100"}`} aria-hidden={mode === "reply"}>
          <div className="flex w-full items-center justify-center gap-1">
            <p
              tabIndex={0}
              role="textbox"
              aria-readonly="true"
              aria-label="Number to dial"
              aria-live="polite"
              data-testid="dialed"
              className={`min-h-14 max-w-full overflow-hidden rounded-xl px-2 text-center font-light tracking-[0.12em] text-white tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${sizeClass} leading-[3.5rem]`}
            >
              {dialed}
              <span aria-hidden="true" className="fg-caret ml-0.5 inline-block h-8 w-0.5 translate-y-1.5 rounded bg-emerald-300 align-baseline" />
            </p>
          </div>
          <p className="mt-1 min-h-5 text-center text-xs text-emerald-100/85">
            {empty ? <>Dial <span className="font-bold text-white">{DEMO_SHORT_CODE}</span> (keypad letters F-A-S-L), then press the green button</> : "Press the green button to call"}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => void pasteFromClipboard()} disabled={locked} className="min-h-11 rounded-full px-4 text-xs font-bold text-emerald-100 ring-1 ring-white/20 transition-colors hover:bg-white/10 active:scale-95">Paste</button>
            <button type="button" onClick={onQuickStart} disabled={locked || quickStartDisabled} className="min-h-11 rounded-full px-4 text-xs font-bold text-emerald-100 ring-1 ring-white/20 transition-colors hover:bg-white/10 active:scale-95 disabled:opacity-50">{quickStartLabel}</button>
          </div>
        </div>
        {children}
      </div>

      <Keypad onKey={(key) => onKey(key)} disabled={locked} />

      <div className="mt-3 grid grid-cols-3 items-center justify-items-center">
        <span aria-hidden="true" />
        <button
          type="button"
          onClick={() => {
            haptic(10);
            onPrimary();
          }}
          disabled={locked || primaryDisabled}
          aria-label={mode === "dial" ? "Call" : "Send reply"}
          className={`fg-key grid size-[4.25rem] place-items-center rounded-full bg-emerald-600 text-white shadow-[0_10px_24px_-6px_rgb(16_185_129/.7)] ring-1 ring-emerald-300/40 hover:bg-emerald-500 ${mode === "dial" && !busy && !primaryDisabled && !locked ? "fg-call-idle" : ""}`}
        >
          {mode === "dial" ? (
            <PhoneIcon className="size-8" />
          ) : (
            <svg viewBox="0 0 24 24" className="size-7" fill="currentColor" aria-hidden="true"><path d="M3 20.5V3.5L21 12 3 20.5zm2-3.2L16.6 12 5 6.7v3.8l7 1.5-7 1.5v3.8z" /></svg>
          )}
        </button>
        <button
          type="button"
          aria-label="Delete last digit (hold to clear)"
          disabled={locked || (mode === "dial" && empty)}
          onPointerDown={startPress}
          onPointerUp={() => {
            endPress();
            if (!longPressed.current) {
              haptic(10);
              onBackspace();
            }
            longPressed.current = false;
          }}
          onPointerLeave={endPress}
          onPointerCancel={endPress}
          onContextMenu={(event) => event.preventDefault()}
          onClick={(event) => {
            if (event.detail === 0) onBackspace();
          }}
          className={`fg-key grid size-12 place-items-center rounded-full text-white/85 hover:bg-white/10 ${mode === "dial" && empty ? "invisible" : ""}`}
        >
          <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12a1 1 0 001-1V6a1 1 0 00-1-1z" /><path d="M17 9.5l-5 5M12 9.5l5 5" /></svg>
        </button>
      </div>
    </div>
  );
}
