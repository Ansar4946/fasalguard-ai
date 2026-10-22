import { useCallback, useEffect, useRef, useState } from "react";
import { isAllowedApiBase } from "./api-url.mjs";
import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { randomUUID } from "expo-crypto";
import {
  DEMO_CODE,
  KEYS,
  demoStep,
  describeError,
  extractReceiptId,
  fetchLedger,
  formatPkrMinor,
  parseReviewScreen,
  parseUssdResponse,
  verifyReceipt,
} from "./ussd.mjs";

type Entry = {
  id: string;
  amountMinor: string;
  farmName: string;
  category: string;
  occurredOn: string;
};
type Expected = { amountMinor: string; farmName: string; category: string };
type Verify = "none" | "checking" | "verified" | "missing" | "mismatch";
type Ledger =
  | { status: "loading" | "retrying"; entries: Entry[] | null }
  | { status: "ready"; entries: Entry[] }
  | { status: "error" | "unauthorized"; entries: Entry[] | null; message: string };

const IDLE_SCREEN = "Dial the demo code and press Call to open a simulated session.";
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function UssdDemo({
  accessToken,
  coreUrl,
}: {
  accessToken: string;
  coreUrl: string | undefined;
}) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [dialed, setDialed] = useState("");
  const [screen, setScreen] = useState(IDLE_SCREEN);
  const [input, setInput] = useState("");
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState<{ eventId: string; input: string } | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [verify, setVerify] = useState<Verify>("none");
  const [mismatch, setMismatch] = useState<string | null>(null);
  const [ledger, setLedger] = useState<Ledger>({ status: "loading", entries: null });
  const mounted = useRef(true);
  const ticket = useRef(0);
  const review = useRef<Expected | null>(null);

  const loadLedger = useCallback(async (): Promise<Entry[] | null> => {
    const mine = ++ticket.current;
    try {
      const entries = (await fetchLedger(coreUrl ?? "", accessToken)) as Entry[];
      if (!mounted.current || mine !== ticket.current) return null;
      setLedger({ status: "ready", entries });
      return entries;
    } catch (reason) {
      if (!mounted.current || mine !== ticket.current) return null;
      const code = reason instanceof Error ? reason.message : "";
      if (code === "UNAUTHORIZED")
        setLedger({ status: "unauthorized", entries: null, message: describeError(code) });
      else
        setLedger((current) => ({
          status: "error",
          entries: current.entries,
          message: describeError(code),
        }));
      return null;
    }
  }, [accessToken, coreUrl]);

  useEffect(() => {
    mounted.current = true;
    const mine = ++ticket.current;
    fetchLedger(coreUrl ?? "", accessToken).then(
      (entries) => {
        if (mounted.current && mine === ticket.current)
          setLedger({ status: "ready", entries: entries as Entry[] });
      },
      (reason: unknown) => {
        if (!mounted.current || mine !== ticket.current) return;
        const code = reason instanceof Error ? reason.message : "";
        setLedger(
          code === "UNAUTHORIZED"
            ? { status: "unauthorized", entries: null, message: describeError(code) }
            : { status: "error", entries: null, message: describeError(code) },
        );
      },
    );
    return () => {
      mounted.current = false;
    };
  }, [accessToken, coreUrl]);

  async function verifyReceiptInLedger(receipt: string, expected: Expected | null) {
    setVerify("checking");
    setMismatch(null);
    for (let attempt = 0; attempt < 3; attempt += 1) {
      if (attempt > 0) await wait(800);
      if (!mounted.current) return;
      const entries = await loadLedger();
      if (!mounted.current) return;
      if (!entries) break;
      const result = verifyReceipt(entries, receipt, expected);
      if (result.kind === "verified") return setVerify("verified");
      if (result.kind === "mismatch") {
        setMismatch(result.reason ?? null);
        return setVerify("mismatch");
      }
    }
    setVerify("missing");
  }

  async function send(payload: { eventId: string; input: string }, session: string) {
    setBusy(true);
    setError(null);
    try {
      const text = await demoStep(coreUrl ?? "", accessToken, { ...payload, sessionId: session });
      const parsed = parseUssdResponse(text);
      const reviewed = parseReviewScreen(text);
      if (reviewed) review.current = reviewed;
      setScreen(parsed.content);
      setActive(parsed.mode === "continue");
      setInput("");
      setPending(null);
      const receipt = extractReceiptId(text);
      setReceiptId(receipt);
      if (receipt) await verifyReceiptInLedger(receipt, review.current);
      else setVerify("none");
      if (parsed.mode === "end") review.current = null;
    } catch (reason) {
      const code = reason instanceof Error ? reason.message : "";
      if (code === "UNAUTHORIZED") {
        setActive(false);
        setPending(null);
      } else setPending(payload);
      setError(describeError(code));
    } finally {
      if (mounted.current) setBusy(false);
    }
  }

  async function call() {
    if (busy || active) return;
    if (!acknowledged) return setError("Switch on the acknowledgement before dialing.");
    if (dialed !== DEMO_CODE)
      return setError(`Connection problem or invalid MMI code. This simulator answers only ${DEMO_CODE}.`);
    const next = randomUUID();
    setDialed("");
    setSessionId(next);
    setReceiptId(null);
    setVerify("none");
    review.current = null;
    await send({ eventId: randomUUID(), input: "" }, next);
  }

  async function submit() {
    if (!sessionId || !active || busy) return;
    await send({ eventId: randomUUID(), input }, sessionId);
  }

  const verifyText =
    verify === "verified"
      ? "Saved and verified: the ledger holds this exact receipt with the confirmed amount."
      : verify === "checking"
        ? "Receipt received; checking the ledger…"
        : verify === "mismatch"
          ? `Receipt found, but its ${mismatch ?? "details"} does not match what you confirmed. Do not rely on it.`
          : "Receipt received, but it is not yet visible in your ledger. Refresh before relying on it.";
  const disabled = !isAllowedApiBase(coreUrl);

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>USSD farm expense simulator</Text>
      <View style={styles.notice} accessibilityRole="alert">
        <Text style={styles.noticeTitle}>SIMULATION — no mobile operator or short code is connected</Text>
        <Text>
          This app reproduces the application flow. It does not place a USSD call or move money.
          Confirming an expense creates a real ledger record.
        </Text>
        <View style={styles.switchRow}>
          <Switch
            value={acknowledged}
            onValueChange={setAcknowledged}
            accessibilityLabel="I understand this is a simulation"
          />
          <Text style={styles.flex}>I understand this is a simulation.</Text>
        </View>
      </View>
      {disabled && <Text style={styles.error}>{describeError("HTTPS_REQUIRED")}</Text>}

      <Text
        style={styles.screen}
        accessibilityRole="text"
        accessibilityLiveRegion="polite"
        testID="ussd-screen"
      >
        {screen}
      </Text>

      {active ? (
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            editable={!busy}
            keyboardType="number-pad"
            maxLength={32}
            accessibilityLabel="USSD menu response"
            style={styles.input}
            onSubmitEditing={() => void submit()}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={busy}
            onPress={() => void submit()}
            style={[styles.send, busy && styles.dim]}
          >
            <Text style={styles.sendText}>Send</Text>
          </Pressable>
        </View>
      ) : (
        <View>
          <Text style={styles.dialed} accessibilityLiveRegion="polite" testID="dialed">
            {dialed || " "}
          </Text>
          <Text style={styles.hint}>Dial {DEMO_CODE} then press Call.</Text>
          <View style={styles.pad}>
            {KEYS.map((key) => (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={key === "*" ? "star" : key === "#" ? "hash" : key}
                onPress={() => setDialed((value) => (value + key).slice(0, 12))}
                style={styles.key}
              >
                <Text style={styles.keyText}>{key}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete last digit"
              onPress={() => setDialed((value) => value.slice(0, -1))}
              style={styles.key}
            >
              <Text style={styles.keyText}>⌫</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Call"
              disabled={busy || disabled || dialed === ""}
              onPress={() => void call()}
              style={[styles.call, (busy || disabled || dialed === "") && styles.dim]}
            >
              <Text style={styles.sendText}>Call</Text>
            </Pressable>
          </View>
        </View>
      )}

      {error && (
        <Text style={styles.error} accessibilityRole="alert">
          {error}
        </Text>
      )}
      {pending && sessionId && (
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void send(pending, sessionId)}
          style={styles.outline}
        >
          <Text>Retry same step</Text>
        </Pressable>
      )}
      {receiptId && (
        <Text
          style={[styles.receipt, verify === "verified" && styles.receiptOk]}
          accessibilityLiveRegion="polite"
        >
          {verifyText} Receipt {receiptId}
        </Text>
      )}

      <View style={styles.ledgerHead}>
        <Text style={styles.subheading}>Recent farm expenses</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh ledger"
          disabled={disabled || ledger.status === "loading" || ledger.status === "retrying"}
          onPress={() => {
            setLedger((current) => ({ status: "retrying", entries: current.entries }));
            void loadLedger();
          }}
          style={styles.outline}
        >
          <Text>Refresh</Text>
        </Pressable>
      </View>
      {(ledger.status === "error" || ledger.status === "unauthorized") && (
        <Text style={styles.error} accessibilityRole="alert">
          Ledger unavailable: {ledger.message}
          {ledger.entries ? " Showing the last records loaded; they may be out of date." : ""}
        </Text>
      )}
      {ledger.status === "retrying" && <Text>Retrying…</Text>}
      {ledger.status === "loading" && <Text>Loading farm expenses…</Text>}
      {ledger.status === "ready" && ledger.entries.length === 0 && (
        <Text>No USSD expenses have been recorded yet.</Text>
      )}
      {ledger.entries?.map((entry) => (
        <View
          key={entry.id}
          style={[styles.entry, entry.id === receiptId && styles.entryNew]}
        >
          <Text style={styles.entryAmount}>{formatPkrMinor(entry.amountMinor)}</Text>
          <Text>
            {entry.category} · {entry.farmName} · {entry.occurredOn}
          </Text>
          <Text style={styles.mono} numberOfLines={1}>
            {entry.id}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { padding: 12, gap: 12, backgroundColor: "#fff", borderRadius: 12 },
  heading: { fontSize: 19, fontWeight: "600" },
  subheading: { fontSize: 16, fontWeight: "600" },
  notice: { padding: 12, gap: 6, backgroundColor: "#fffbeb", borderColor: "#fbbf24", borderWidth: 2, borderRadius: 12 },
  noticeTitle: { fontWeight: "700" },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44 },
  flex: { flex: 1 },
  screen: { minHeight: 150, padding: 12, backgroundColor: "#d8e7c1", borderRadius: 12, fontFamily: "monospace", color: "#0f172a" },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, minHeight: 48, borderWidth: 1, borderColor: "#94a3b8", borderRadius: 12, paddingHorizontal: 12, backgroundColor: "#fff" },
  send: { minHeight: 48, paddingHorizontal: 20, borderRadius: 12, backgroundColor: "#075f3d", justifyContent: "center" },
  sendText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  dim: { opacity: 0.5 },
  dialed: { minHeight: 48, textAlign: "center", fontSize: 26, letterSpacing: 4, fontFamily: "monospace", paddingVertical: 8, backgroundColor: "#f1f5f9", borderRadius: 12 },
  hint: { textAlign: "center", fontSize: 12, color: "#475569", marginTop: 4 },
  pad: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8, justifyContent: "center" },
  key: { width: "30%", minHeight: 56, borderRadius: 16, borderWidth: 1, borderColor: "#cbd5e1", alignItems: "center", justifyContent: "center", backgroundColor: "#fff" },
  keyText: { fontSize: 24, fontWeight: "700" },
  call: { width: "63%", minHeight: 56, borderRadius: 16, backgroundColor: "#059669", alignItems: "center", justifyContent: "center" },
  error: { padding: 10, backgroundColor: "#fef2f2", color: "#b91c1c", borderRadius: 10, fontWeight: "600" },
  outline: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: "#075f3d", justifyContent: "center", alignSelf: "flex-start" },
  receipt: { padding: 10, backgroundColor: "#fffbeb", borderRadius: 10 },
  receiptOk: { backgroundColor: "#ecfdf5" },
  ledgerHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  entry: { padding: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, gap: 2 },
  entryNew: { borderColor: "#075f3d", backgroundColor: "#ecfdf5" },
  entryAmount: { fontSize: 18, fontWeight: "800" },
  mono: { fontFamily: "monospace", fontSize: 10, color: "#64748b" },
});
