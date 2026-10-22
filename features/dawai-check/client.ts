import { extractList } from "./history";
import type {
  CreateCheckInput,
  HistoryItem,
  ManualCheckInput,
  PesticideCheckResult,
  ProductSuggestion,
} from "./types";

export type DawaiErrorKind = "offline" | "unavailable" | "auth" | "invalid" | "upload" | "unknown";

export class DawaiError extends Error {
  constructor(
    readonly kind: DawaiErrorKind,
    message = kind,
  ) {
    super(message);
  }
}

function kindForStatus(status: number): DawaiErrorKind {
  if (status === 401) return "auth";
  if (status === 400 || status === 422) return "invalid";
  if (status === 404 || status === 501 || status === 502 || status === 503 || status === 504) return "unavailable";
  return "unknown";
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { cache: "no-store", ...init });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new DawaiError(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "unavailable");
  }
  if (!response.ok) throw new DawaiError(kindForStatus(response.status));
  return (await response.json().catch(() => {
    throw new DawaiError("unknown");
  })) as T;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function sha256Hex(file: File): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  } catch {
    return undefined;
  }
}

/** Real presign -> PUT -> complete, same flow as the crop scan uploader. Returns the media asset id. */
export async function uploadLabelPhoto(file: File): Promise<string> {
  const checksum = await sha256Hex(file);
  const presign = await post<{ media: { id: string }; upload: { url: string; headers: Record<string, string> } }>(
    "/api/uploads/presign",
    {
      fileName: file.name,
      contentType: file.type,
      sizeBytes: file.size,
      ...(checksum ? { checksum } : {}),
      purpose: "pesticide-label",
    },
  );
  let put: Response;
  try {
    put = await fetch(presign.upload.url, { method: "PUT", headers: presign.upload.headers, body: file });
  } catch {
    throw new DawaiError(typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "upload");
  }
  if (!put.ok) throw new DawaiError("upload");
  await post("/api/uploads/complete", { mediaId: presign.media.id, ...(checksum ? { checksum } : {}) });
  return presign.media.id;
}

export function createCheck(input: CreateCheckInput): Promise<PesticideCheckResult> {
  return post<PesticideCheckResult>("/api/pesticide-checks", input);
}

export function createManualCheck(input: ManualCheckInput): Promise<PesticideCheckResult> {
  return post<PesticideCheckResult>("/api/pesticide-checks/manual", input);
}

export function getCheck(id: string): Promise<PesticideCheckResult> {
  return request<PesticideCheckResult>(`/api/pesticide-checks/${encodeURIComponent(id)}`);
}

export async function listChecks(): Promise<HistoryItem[]> {
  return extractList<HistoryItem>(await request<unknown>("/api/pesticide-checks"));
}

export async function searchProducts(search: string, signal?: AbortSignal): Promise<ProductSuggestion[]> {
  return extractList<ProductSuggestion>(
    await request<unknown>(`/api/pesticide-products?search=${encodeURIComponent(search)}`, { signal }),
  );
}
