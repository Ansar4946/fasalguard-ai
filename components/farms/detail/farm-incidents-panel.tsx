"use client";

import { useEffect, useState } from "react";
import { FeedbackPrompt } from "@/components/growth/feedback-prompt";

interface Incident {
  id: string;
  fieldId: string | null;
  type: string;
  state: string;
  severity: string | null;
  confidence: number | null;
  title: string;
  observedAt: string;
  farmerConfirmed: boolean | null;
}

interface CropScanOption {
  id: string;
  createdAt: string;
  screenedCondition: string | null;
}

interface SeasonSummary {
  incidentsTotal: number;
  incidentsResolved: number;
  resolutionRate: number | null;
  taskCompletionRate: number | null;
}

type LoadState = "loading" | "ready" | "error";

async function fetchIncidents(farmId: string): Promise<Incident[] | null> {
  const res = await fetch(`/api/farms/${farmId}/digital-twin`, { cache: "no-store" });
  if (!res.ok) return null;
  const body = (await res.json()) as { activeIncidents?: Incident[] };
  return body.activeIncidents ?? [];
}

async function fetchSeasonSummary(farmId: string): Promise<SeasonSummary | null> {
  const res = await fetch(`/api/farms/${farmId}/impact-summary`, { cache: "no-store" });
  if (!res.ok) return null;
  return (await res.json()) as SeasonSummary;
}

export function FarmIncidentsPanel({ farmId }: { farmId: string }) {
  const [state, setState] = useState<LoadState>("loading");
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [summary, setSummary] = useState<SeasonSummary | null>(null);

  useEffect(() => {
    // setState only happens inside these .then()/.catch() callbacks, never synchronously in the effect body.
    Promise.all([fetchIncidents(farmId), fetchSeasonSummary(farmId)])
      .then(([incidentsResult, summaryResult]) => {
        if (incidentsResult === null) return setState("error");
        setIncidents(incidentsResult);
        setSummary(summaryResult);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [farmId]);

  if (state === "loading")
    return <p className="p-8 text-center text-xs text-muted">Loading farm intelligence…</p>;
  if (state === "error")
    return (
      <p className="p-8 text-center text-xs font-semibold text-danger">
        Could not load intelligence for this farm.
      </p>
    );

  return (
    <div className="p-5">
      {summary && summary.incidentsTotal > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SeasonStat label="Incidents" value={String(summary.incidentsTotal)} />
          <SeasonStat label="Resolved" value={String(summary.incidentsResolved)} />
          <SeasonStat
            label="Resolution rate"
            value={summary.resolutionRate === null ? "—" : `${Math.round(summary.resolutionRate * 100)}%`}
          />
          <SeasonStat
            label="Action completion"
            value={summary.taskCompletionRate === null ? "—" : `${Math.round(summary.taskCompletionRate * 100)}%`}
          />
        </div>
      )}

      {incidents.length === 0 ? (
        <div className="flex min-h-32 flex-col items-center justify-center gap-2 py-8 text-center">
          <p className="text-xs font-bold text-brand-dark">No active incidents</p>
          <p className="max-w-sm text-[10px] text-muted">
            Weather, satellite, and crop-health alerts will appear here once monitoring is active
            for this farm.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {incidents.map((incident) => (
            <IncidentCard key={incident.id} farmId={farmId} incident={incident} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SeasonStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-soft p-3 text-center">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-1 text-sm font-extrabold text-brand-dark">{value}</p>
    </div>
  );
}

function IncidentCard({ farmId, incident }: { farmId: string; incident: Incident }) {
  const [farmerConfirmed, setFarmerConfirmed] = useState(incident.farmerConfirmed);
  const [confirming, setConfirming] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);

  function confirm(confirmed: boolean): void {
    setConfirming(true);
    fetch(`/api/farms/${farmId}/incidents/${incident.id}/confirm`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed }),
    })
      .then((res) => {
        if (res.ok) setFarmerConfirmed(confirmed);
      })
      .catch(() => {
        /* leave state unchanged; the buttons remain available to retry */
      })
      .finally(() => setConfirming(false));
  }

  return (
    <li className="rounded-2xl border border-brand/10 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-dark">
          {incident.state.replace(/_/g, " ")}
        </span>
        {incident.severity && (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-warning">
            {incident.severity}
          </span>
        )}
        <span className="text-[10px] text-muted">
          {new Date(incident.observedAt).toLocaleDateString()}
        </span>
      </div>
      <p className="mt-2 text-sm font-bold text-brand-dark">{incident.title}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {farmerConfirmed === null ? (
          <>
            <button
              type="button"
              disabled={confirming}
              onClick={() => confirm(true)}
              className="inline-flex min-h-8 items-center rounded-full bg-success/10 px-3 text-[11px] font-bold text-success disabled:opacity-50"
            >
              This matches my field
            </button>
            <button
              type="button"
              disabled={confirming}
              onClick={() => confirm(false)}
              className="inline-flex min-h-8 items-center rounded-full bg-danger/10 px-3 text-[11px] font-bold text-danger disabled:opacity-50"
            >
              Doesn&apos;t match
            </button>
          </>
        ) : (
          <span className="text-[11px] font-semibold text-muted">
            {farmerConfirmed ? "You confirmed this alert" : "You marked this as inaccurate"}
          </span>
        )}
        <button
          type="button"
          onClick={() => setShowFollowUp((v) => !v)}
          className="ml-auto inline-flex min-h-8 items-center rounded-full border border-brand/20 px-3 text-[11px] font-bold text-brand-dark"
        >
          {showFollowUp ? "Cancel" : "Record follow-up"}
        </button>
      </div>

      {showFollowUp && (
        <FollowUpForm
          farmId={farmId}
          incident={incident}
          onDone={() => setShowFollowUp(false)}
        />
      )}
    </li>
  );
}

function FollowUpForm({
  farmId,
  incident,
  onDone,
}: {
  farmId: string;
  incident: Incident;
  onDone: () => void;
}) {
  const [status, setStatus] = useState("IMPROVED");
  const [outcome, setOutcome] = useState("");
  const [scans, setScans] = useState<CropScanOption[] | null>(null);
  const [cropScanId, setCropScanId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    // setState only happens inside this .then()/.catch() chain, never synchronously in the effect body.
    if (!incident.fieldId) {
      Promise.resolve().then(() => setScans([]));
      return;
    }
    fetch(`/api/crop-scans?fieldId=${incident.fieldId}`, { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<CropScanOption[]>) : Promise.resolve([])))
      .then((rows) => setScans(rows))
      .catch(() => setScans([]));
  }, [incident.fieldId]);

  function submit(): void {
    if (!cropScanId) {
      setError("Choose a recent crop scan as evidence for this follow-up.");
      return;
    }
    setSubmitting(true);
    setError(null);
    fetch(`/api/farms/${farmId}/incidents/${incident.id}/follow-up`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status, outcome: outcome || undefined, cropScanId }),
    })
      .then((res) => {
        if (!res.ok) {
          setError("Could not record this follow-up. Try again.");
          return;
        }
        if (status === "IMPROVED") {
          setResolved(true);
        } else {
          onDone();
        }
      })
      .catch(() => setError("Could not record this follow-up. Try again."))
      .finally(() => setSubmitting(false));
  }

  if (resolved)
    return (
      <div className="mt-3 rounded-xl bg-surface-soft p-3">
        <p className="text-xs font-bold text-brand-dark">
          Marked as resolved. Was this real-time monitoring useful?
        </p>
        <div className="mt-2">
          <FeedbackPrompt
            feature="INCIDENT_RESOLUTION"
            contextId={incident.id}
            farmId={farmId}
            onDone={onDone}
          />
        </div>
      </div>
    );

  return (
    <div className="mt-3 space-y-2 rounded-xl bg-surface-soft p-3">
      <label className="block text-[10px] font-bold text-muted">
        Outcome
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-brand/15 bg-white p-2 text-xs"
        >
          <option value="IMPROVED">Improved</option>
          <option value="UNCHANGED">Unchanged</option>
          <option value="WORSENED">Worsened</option>
          <option value="INCONCLUSIVE">Inconclusive</option>
        </select>
      </label>

      <label className="block text-[10px] font-bold text-muted">
        Evidence — a recent crop scan for this field
        {scans === null ? (
          <p className="mt-1 text-[10px] text-muted">Loading recent scans…</p>
        ) : scans.length === 0 ? (
          <p className="mt-1 text-[10px] text-danger">
            No diagnosed crop scans found for this field yet. Scan the field first, then come back
            to record a follow-up.
          </p>
        ) : (
          <select
            value={cropScanId}
            onChange={(e) => setCropScanId(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-brand/15 bg-white p-2 text-xs"
          >
            <option value="">Choose a scan…</option>
            {scans.map((scan) => (
              <option key={scan.id} value={scan.id}>
                {scan.screenedCondition ?? "Scan"} — {new Date(scan.createdAt).toLocaleDateString()}
              </option>
            ))}
          </select>
        )}
      </label>

      <label className="block text-[10px] font-bold text-muted">
        Notes (optional)
        <textarea
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded-lg border border-brand/15 bg-white p-2 text-xs"
        />
      </label>

      {error && <p className="text-[10px] font-semibold text-danger">{error}</p>}

      <button
        type="button"
        disabled={submitting || !scans?.length}
        onClick={submit}
        className="inline-flex min-h-9 items-center rounded-full bg-brand px-4 text-[11px] font-bold text-white disabled:opacity-50"
      >
        Submit follow-up
      </button>
    </div>
  );
}
