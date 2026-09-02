"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { AddFieldDialog } from "./add-field-dialog";
import type { FarmSummary, FieldSummary } from "./types";

const HECTARES_TO_ACRES = 2.47105;

export function FieldsManagement({
  farm,
  initialFields,
}: {
  farm: FarmSummary;
  initialFields: FieldSummary[];
}) {
  const [fields, setFields] = useState<FieldSummary[]>(initialFields);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");

  function handleCreated(field: FieldSummary) {
    setFields((current) => [...current, field]);
    setNotice(`${field.name} was added successfully.`);
  }

  return (
    <div className="mx-auto max-w-[1180px] p-4 md:p-6 xl:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <nav className="text-[10px] text-muted">
            <Link href="/farms">My Farms</Link> <span>›</span>{" "}
            <Link href={`/farms/${farm.id}`}>{farm.name}</Link> <span>›</span>{" "}
            <strong className="text-brand">Fields</strong>
          </nav>
          <h1 className="mt-2 text-[26px] font-extrabold">{farm.name} — Fields</h1>
          <p className="mt-1 text-xs text-muted">
            {fields.length === 0
              ? "No fields have been added to this farm yet."
              : `${fields.length} field${fields.length === 1 ? "" : "s"} registered.`}
          </p>
        </div>
        <button
          onClick={() => setDialogOpen(true)}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl bg-brand px-5 text-xs font-extrabold text-white"
        >
          <Icon name="plus" className="size-4" />
          Add New Field
        </button>
      </div>

      {notice && (
        <div role="status" className="mt-4 rounded-xl bg-green-50 p-3 text-xs font-bold text-green-950">
          {notice}
        </div>
      )}

      <section className="mt-5 overflow-hidden rounded-3xl border border-brand/10 bg-white shadow-sm">
        <header className="flex items-center justify-between border-b border-brand/5 p-5">
          <div className="flex items-center gap-2">
            <Icon name="field" className="size-5 text-brand" />
            <h2 className="text-base font-extrabold">Field Inventory</h2>
          </div>
        </header>

        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 p-10 text-center">
            <p className="text-xs font-bold text-brand-dark">No fields yet — add your first field</p>
            <p className="max-w-sm text-[10px] text-muted">
              Draw a boundary on the map to register a field for AI monitoring.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {fields.map((field) => (
              <li key={field.id} className="flex items-center justify-between gap-4 px-5 py-4 text-[11px]">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-lg bg-brand-soft text-brand">▦</span>
                  <div>
                    <strong className="block text-brand-dark">{field.name}</strong>
                    <span className="block text-[9px] text-muted">
                      {field.currentCropCycle ? "Crop cycle assigned" : "No crop assigned yet"}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <strong>{(field.areaHectares * HECTARES_TO_ACRES).toFixed(2)}</strong>
                  <span className="block text-[9px] text-muted">Acres</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AddFieldDialog
        farmId={farm.id}
        farmName={farm.name}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
