import { NextResponse } from "next/server";
import { apiError, authenticatedJson } from "@/lib/auth/server-session";
import type { FarmLedgerEntry } from "@/features/farm-finance/types";

export async function GET(): Promise<Response> {
  const { response, body } = await authenticatedJson<FarmLedgerEntry[]>("/farm-ledger");
  if (!response.ok) {
    const { error, status } = apiError(body, response.status);
    return NextResponse.json({ error }, { status });
  }
  return NextResponse.json(body, { headers: { "cache-control": "no-store, private" } });
}

