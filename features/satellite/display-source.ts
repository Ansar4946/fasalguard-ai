/**
 * Decides what the satellite page shows. Order:
 *  1. a real scan that is still in progress -> real progress UI (never the sample)
 *  2. latest COMPLETED real capture (even if old; staleness is reported)
 *  3. otherwise the clearly labelled SAMPLE preview, with a plain-words reason.
 * A COMPLETED real capture always wins over the sample.
 */
import type { ProcessingStatus, Scan } from "./types";
import type { SampleReason } from "./sample-preview";

export const STALE_AFTER_DAYS = 14;
const DAY_MS = 86400000;
const inProgress = new Set<ProcessingStatus>(["QUEUED", "SEARCHING_SCENE", "PROCESSING", "ANALYSING"]);

export type DisplaySelection =
  | { kind: "REAL"; scan: Scan; ageDays: number | null; stale: boolean }
  | { kind: "REAL_IN_PROGRESS"; scan: Scan }
  | { kind: "SAMPLE"; reason: SampleReason; scan: Scan | null };

function latestCompleted(scans: Scan[]): Scan | null {
  return scans.find((s) => s.processingStatus === "COMPLETED") ?? null; // API lists newest first
}

export function selectDisplaySource(input: {
  scans: Scan[];
  pickedScanId?: string;
  loadFailed?: boolean;
  now?: Date;
}): DisplaySelection {
  const { scans, pickedScanId, loadFailed = false, now = new Date() } = input;
  if (scans.length === 0) return { kind: "SAMPLE", reason: loadFailed ? "LOAD_ERROR" : "NONE", scan: null };
  const picked = scans.find((s) => s.id === pickedScanId) ?? null;
  const completed = latestCompleted(scans);
  const scan = picked ?? completed ?? scans[0];
  if (inProgress.has(scan.processingStatus)) return { kind: "REAL_IN_PROGRESS", scan };
  const real = scan.processingStatus === "COMPLETED" ? scan : completed;
  if (real) {
    const when = real.acquisitionDate ?? real.createdAt;
    const ms = Date.parse(when);
    const ageDays = Number.isFinite(ms) ? Math.max(0, Math.floor((now.getTime() - ms) / DAY_MS)) : null;
    return { kind: "REAL", scan: real, ageDays, stale: ageDays !== null && ageDays > STALE_AFTER_DAYS };
  }
  const reason: SampleReason =
    scan.processingStatus === "CLOUD_BLOCKED" ? "CLOUD_BLOCKED" : scan.processingStatus === "NO_VALID_SCENE" ? "NO_VALID_SCENE" : "FAILED";
  return { kind: "SAMPLE", reason, scan };
}
