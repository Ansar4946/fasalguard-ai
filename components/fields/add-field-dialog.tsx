"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { BoundaryPicker } from "@/components/farms/boundary-picker";
import { toGeoJsonPolygon } from "@/lib/geo/polygon";
import type { FieldSummary } from "./types";

interface Props {
  farmId: string;
  farmName: string;
  open: boolean;
  onClose: () => void;
  onCreated: (field: FieldSummary) => void;
}

const inputClass =
  "mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-xs text-foreground outline-none focus:border-brand focus:ring-1 focus:ring-brand";

export function AddFieldDialog({ farmId, farmName, open, onClose, onCreated }: Props) {
  const router = useRouter();
  const titleId = useId();
  const [name, setName] = useState("");
  const [points, setPoints] = useState<[number, number][]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => event.key === "Escape" && handleClose();
    document.addEventListener("keydown", key);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  function handleClose() {
    setName("");
    setPoints([]);
    setError("");
    setSubmitting(false);
    onClose();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter a field name.");
      return;
    }
    if (points.length < 3) {
      setError("Place at least 3 points on the map to draw the field boundary.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const response = await fetch(`/api/farms/${farmId}/fields`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim(), boundary: toGeoJsonPolygon(points) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(body.error?.message ?? "Could not create the field. Try again.");
        return;
      }
      onCreated(body as FieldSummary);
      router.refresh();
      handleClose();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch justify-end bg-[#17324d]/35 backdrop-blur-[3px]"
      onMouseDown={(event) => event.target === event.currentTarget && handleClose()}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full flex-col bg-[#f8f9ff] shadow-2xl sm:my-auto sm:mr-[6vw] sm:h-auto sm:max-h-[92dvh] sm:max-w-[640px] sm:rounded-2xl"
      >
        <header className="flex items-start justify-between border-b border-brand/5 bg-white px-5 py-4 sm:px-7">
          <div>
            <h2 id={titleId} className="text-xl font-extrabold text-brand-dark">
              Add New Field
            </h2>
            <p className="mt-1 text-[11px] text-muted">Draw the field boundary on the map and give it a name.</p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close add field dialog"
            className="grid size-9 place-items-center rounded-full text-lg text-muted hover:bg-surface-soft"
          >
            ×
          </button>
        </header>
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto p-5 sm:p-7">
            <fieldset>
              <legend className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-brand">
                <span className="size-2 rounded-full bg-brand" />
                General Information
              </legend>
              <label className="block text-[11px] font-bold text-foreground" htmlFor="field-name">
                Field Name
                <input
                  id="field-name"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. North Ridge 01"
                  className={inputClass}
                />
                <small className="mt-1 block text-[9px] font-normal text-muted">
                  Choose a unique name that is easy to identify on the map.
                </small>
              </label>
              <div className="mt-4">
                <label className="block text-[11px] font-bold text-foreground" htmlFor="field-farm">
                  Farm
                  <input id="field-farm" value={farmName} readOnly aria-readonly="true" className={`${inputClass} bg-surface-soft`} />
                </label>
              </div>
            </fieldset>

            <fieldset>
              <legend className="mb-4 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-wider text-brand">
                Field Boundary
              </legend>
              <BoundaryPicker points={points} onChange={setPoints} />
            </fieldset>

            {error && (
              <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-[10px] font-semibold text-danger">
                {error}
              </p>
            )}
          </div>
          <footer className="flex flex-col-reverse gap-3 border-t border-border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-7">
            <button type="button" onClick={handleClose} className="min-h-10 rounded-xl border border-border px-5 text-xs font-bold">
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-10 rounded-full bg-brand px-6 text-xs font-extrabold text-white disabled:opacity-60"
            >
              {submitting ? "Saving field…" : "Save Field"}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );
}
