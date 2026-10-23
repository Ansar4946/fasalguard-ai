import type { ExtractedLabel, Lang, ManualCheckInput } from "./types";

export interface EditableFields {
  brandName: string;
  activeIngredient: string;
  registrationNo: string;
  expiryDate: string;
}

export const emptyFields: EditableFields = { brandName: "", activeIngredient: "", registrationNo: "", expiryDate: "" };

/** Keeps only an ISO yyyy-mm-dd date (what a date input needs); anything else becomes empty. */
export function normalizeDate(value: string | null | undefined): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value?.trim() ?? "");
  return match ? match[1] : "";
}

export function fieldsFromExtracted(extracted: ExtractedLabel | null | undefined): EditableFields {
  return {
    brandName: extracted?.brandName?.trim() ?? "",
    activeIngredient: extracted?.activeIngredient?.trim() ?? "",
    registrationNo: extracted?.registrationNo?.trim() ?? "",
    expiryDate: normalizeDate(extracted?.expiryDate),
  };
}

/** Form values after picking an autocomplete suggestion (notified-list entries carry strength and formulation in their text). */
export function fieldsFromSuggestion(
  fields: EditableFields,
  item: { brandName: string; activeIngredient?: string | null },
): EditableFields {
  return { ...fields, brandName: item.brandName, activeIngredient: item.activeIngredient || fields.activeIngredient };
}

export function fieldsChanged(a: EditableFields, b: EditableFields): boolean {
  return (Object.keys(a) as Array<keyof EditableFields>).some((key) => a[key].trim() !== b[key].trim());
}

export function parsePrice(value: string): number | undefined {
  const text = value.replace(/,/g, "").trim();
  if (text === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export type ManualPayloadResult =
  | { ok: true; payload: ManualCheckInput }
  | { ok: false; error: "brandRequired" };

/** Builds the manual-check body: trims, drops empty optional fields, requires a brand name. */
export function buildManualPayload(fields: EditableFields, language: Lang, priceRs?: number): ManualPayloadResult {
  const brandName = fields.brandName.trim();
  if (!brandName) return { ok: false, error: "brandRequired" };
  const payload: ManualCheckInput = { brandName, language };
  const activeIngredient = fields.activeIngredient.trim();
  const registrationNo = fields.registrationNo.trim();
  const expiryDate = normalizeDate(fields.expiryDate);
  if (activeIngredient) payload.activeIngredient = activeIngredient;
  if (registrationNo) payload.registrationNo = registrationNo;
  if (expiryDate) payload.expiryDate = expiryDate;
  if (priceRs !== undefined && Number.isFinite(priceRs) && priceRs >= 0) payload.priceRs = priceRs;
  return { ok: true, payload };
}
