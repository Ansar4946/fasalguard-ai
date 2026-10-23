/** Pure sizing/validation helpers for label photos (DOM work lives in prepare-photo.ts). */
export const MAX_EDGE_PX = 1600;
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface TargetSize {
  width: number;
  height: number;
  scale: number;
  needsResize: boolean;
}

export function computeTargetSize(width: number, height: number, maxEdge: number = MAX_EDGE_PX): TargetSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
    return { width: 0, height: 0, scale: 1, needsResize: false };
  const longest = Math.max(width, height);
  const scale = longest > maxEdge ? maxEdge / longest : 1;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    scale,
    needsResize: scale < 1,
  };
}

export type FileProblem = "type" | "tooBig" | null;

export function validateSourceFile(type: string, size: number): FileProblem {
  if (!ALLOWED_TYPES.includes(type)) return "type";
  if (size > MAX_SOURCE_BYTES) return "tooBig";
  return null;
}

/** A photo is re-encoded unless it is already a modest JPEG within the edge limit. */
export function needsReencode(type: string, size: number, width: number, height: number): boolean {
  return type !== "image/jpeg" || size > MAX_UPLOAD_BYTES / 2 || computeTargetSize(width, height).needsResize;
}

export function jpegFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim() || "label";
  return `${base}.jpg`;
}
