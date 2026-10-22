"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { DashboardTask } from "@/features/dashboard/types";

export function DashboardTasks({ tasks, pendingCount }: { tasks: DashboardTask[]; pendingCount: number }) {
  const router = useRouter();
  const [completing, setCompleting] = useState<string | null>(null);
  const [completed, setCompleted] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function complete(task: DashboardTask) {
    if (completing) return;
    setCompleting(task.id);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${task.id}/complete`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
        throw new Error(body.error?.message ?? "Could not complete the task.");
      }
      setCompleted((current) => new Set(current).add(task.id));
      startTransition(() => router.refresh());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not complete the task.");
    } finally {
      setCompleting(null);
    }
  }

  return (
    <section className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold">Pending Tasks</h2>
        <span className="grid size-6 place-items-center rounded-full bg-brand text-xs text-white">{pendingCount}</span>
      </div>
      {tasks.length === 0 ? (
        <p className="mt-4 text-xs leading-5 text-muted">No pending tasks. New inspection tasks appear here when weather, satellite or scan results need your attention.</p>
      ) : (
        <ul className="mt-4 space-y-4">
          {tasks.map((task) => {
            const done = completed.has(task.id);
            return (
              <li key={task.id}>
                <label className="flex gap-3 text-xs leading-5">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-brand"
                    checked={done}
                    disabled={done || completing !== null}
                    onChange={() => complete(task)}
                    aria-label={`Mark "${task.title}" complete`}
                  />
                  <span className={done ? "text-muted line-through" : undefined}>
                    {task.title}
                    <small className="block text-[9px] text-muted" suppressHydrationWarning>
                      {[task.fieldName, dueLabel(task.dueAt)].filter(Boolean).join(" · ")}
                    </small>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {error && <p role="alert" className="mt-3 text-[11px] font-semibold text-danger">{error}</p>}
      <Link href="/tasks" className="mt-4 block text-center text-[11px] font-bold text-brand">View all tasks</Link>
    </section>
  );
}

function dueLabel(dueAt: string | null): string {
  if (!dueAt) return "No due date";
  const due = new Date(dueAt);
  const today = new Date();
  const days = Math.round(
    (Date.UTC(due.getFullYear(), due.getMonth(), due.getDate()) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / 86_400_000,
  );
  if (days < 0) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `Due ${due.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
}
