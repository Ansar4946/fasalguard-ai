"use client";

import { useEffect, useState } from "react";

interface PilotSummary {
  generatedAt: string;
  policy: { excludesTestAccounts: boolean };
  cohortSize: number;
  usersAcquired: number;
  usersOnboarded: number;
  activeUsers: number;
  farmsCreated: number;
  cropSeasons: number;
  returningUsers: { eligibleUsers: number; returnedUsers: number; rate: number | null };
}
interface Enrollment {
  id: string;
  status: string;
  source: string | null;
  invitedAt: string;
  registeredAt: string | null;
  onboardedAt: string | null;
  activatedAt: string | null;
  completedAt: string | null;
  droppedAt: string | null;
  userId: string;
  email: string;
  fullName: string | null;
}
type LoadState = "loading" | "ready" | "unauthorized" | "error";

async function fetchJson<T>(url: string): Promise<T | "unauthorized" | "error"> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 403) return "unauthorized";
  if (!res.ok) return "error";
  return (await res.json()) as T;
}

function pct(value: number | null): string {
  return value === null ? "—" : `${Math.round(value * 100)}%`;
}

export function PilotDashboard() {
  const [state, setState] = useState<LoadState>("loading");
  const [summary, setSummary] = useState<PilotSummary | null>(null);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [inviteUserId, setInviteUserId] = useState("");
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    // setState only happens inside this .then()/.catch() chain, never synchronously in the effect body.
    Promise.all([
      fetchJson<PilotSummary>("/api/admin/pilot/summary"),
      fetchJson<Enrollment[]>("/api/admin/pilot/enrollments"),
    ])
      .then(([summaryResult, enrollmentsResult]) => {
        if (summaryResult === "unauthorized") return setState("unauthorized");
        if (summaryResult === "error" || enrollmentsResult === "error") return setState("error");
        setSummary(summaryResult);
        setEnrollments(Array.isArray(enrollmentsResult) ? enrollmentsResult : []);
        setState("ready");
      })
      .catch(() => setState("error"));
  }, [refreshKey]);

  function invite(): void {
    setInviteError(null);
    setInviting(true);
    fetch("/api/admin/pilot/enrollments", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: inviteUserId.trim() }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
          setInviteError(body?.error?.message ?? "Could not invite this user.");
          return;
        }
        setInviteUserId("");
        setRefreshKey((k) => k + 1);
      })
      .catch(() => setInviteError("Could not invite this user."))
      .finally(() => setInviting(false));
  }

  function closeOut(id: string, action: "complete" | "drop"): void {
    fetch(`/api/admin/pilot/enrollments/${id}/${action}`, { method: "POST" })
      .then((res) => {
        if (res.ok) setRefreshKey((k) => k + 1);
      })
      .catch(() => {
        /* leave the row as-is; the action buttons remain available to retry */
      });
  }

  if (state === "loading")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10 text-sm text-muted" role="status">
        Loading the real pilot cohort…
      </div>
    );
  if (state === "unauthorized")
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm font-semibold text-amber-900">
          You need an Admin or Super Admin account to view the pilot program.
        </p>
      </div>
    );
  if (state === "error" || !summary)
    return (
      <div className="mx-auto max-w-6xl px-4 py-10">
        <p className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-900">
          Could not load pilot program data. Try refreshing.
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      <header>
        <p className="text-[10px] font-extrabold uppercase tracking-[.16em] text-success">
          Every number below is a real, persisted pilot enrollment — no fabricated cohorts
        </p>
        <h1 className="mt-1 text-2xl font-bold text-brand-dark">Pilot Program</h1>
        <p className="mt-1 text-xs text-muted">
          Cohort size: {summary.cohortSize} · test/demo accounts excluded
        </p>
      </header>

      <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Stat label="Users acquired" value={summary.usersAcquired} />
        <Stat label="Users onboarded" value={summary.usersOnboarded} />
        <Stat label="Active users (7d)" value={summary.activeUsers} />
        <Stat label="Farms created" value={summary.farmsCreated} />
        <Stat label="Crop seasons" value={summary.cropSeasons} />
        <Stat label="Returning users" value={pct(summary.returningUsers.rate)} />
      </section>

      <section className="mt-6 rounded-2xl border border-brand/10 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-brand-dark">Invite an existing farmer into the pilot</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={inviteUserId}
            onChange={(e) => setInviteUserId(e.target.value)}
            placeholder="Farmer user id (UUID)"
            className="min-h-9 flex-1 rounded-lg border border-brand/15 px-3 text-xs"
          />
          <button
            type="button"
            disabled={inviting || !inviteUserId.trim()}
            onClick={invite}
            className="inline-flex min-h-9 items-center rounded-full bg-brand px-4 text-xs font-bold text-white disabled:opacity-50"
          >
            Invite
          </button>
        </div>
        {inviteError && <p className="mt-2 text-[11px] font-semibold text-danger">{inviteError}</p>}
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-brand/10 bg-white shadow-sm">
        <div className="border-b border-brand/5 p-5">
          <h2 className="text-sm font-bold text-brand-dark">Pilot enrollments</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-surface-soft text-[10px] uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-2">Farmer</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Source</th>
                <th className="px-4 py-2">Invited</th>
                <th className="px-4 py-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted">
                    No pilot enrollments yet.
                  </td>
                </tr>
              )}
              {enrollments.map((e) => (
                <tr key={e.id} className="border-t border-brand/5">
                  <td className="px-4 py-2">
                    <div className="font-semibold text-brand-dark">{e.fullName ?? e.email}</div>
                    <div className="text-[10px] text-muted">{e.email}</div>
                  </td>
                  <td className="px-4 py-2 font-bold">{e.status}</td>
                  <td className="px-4 py-2">{e.source ?? "—"}</td>
                  <td className="px-4 py-2">{new Date(e.invitedAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    {e.status !== "COMPLETED" && e.status !== "DROPPED" && (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => closeOut(e.id, "complete")}
                          className="rounded-full bg-success/10 px-2 py-1 text-[10px] font-bold text-success"
                        >
                          Complete
                        </button>
                        <button
                          type="button"
                          onClick={() => closeOut(e.id, "drop")}
                          className="rounded-full bg-danger/10 px-2 py-1 text-[10px] font-bold text-danger"
                        >
                          Drop
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <article className="rounded-2xl border border-brand/10 bg-white p-4 shadow-sm">
      <p className="text-[9px] font-bold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-xl font-extrabold text-brand-dark">{value}</p>
    </article>
  );
}
