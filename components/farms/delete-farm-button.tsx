"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DeleteFarmButton({ farmId, farmName }: { farmId: string; farmName: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete "${farmName}"? This also permanently removes all of its fields and crop cycles. This cannot be undone.`,
    );
    if (!confirmed) return;

    setError("");
    setDeleting(true);
    try {
      const response = await fetch(`/api/farms/${farmId}`, { method: "DELETE" });
      if (!response.ok && response.status !== 204) {
        const body = await response.json().catch(() => ({}));
        setError(body.error?.message ?? "Could not delete the farm. Try again.");
        setDeleting(false);
        return;
      }
      router.push("/farms");
      router.refresh();
    } catch {
      setError("Could not delete the farm. Try again.");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={deleting}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-danger/20 bg-white px-4 text-xs font-bold text-danger transition hover:bg-danger/5 disabled:opacity-60"
      >
        {deleting ? "Deleting…" : "Delete"}
      </button>
      {error && <p role="alert" className="text-[10px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
