import { isAllowedApiBase } from "./api-url.mjs";
import { pending, acknowledge, cursor, applyChanges } from "./database.mjs";

export async function syncPending(db, session, base, fetcher = fetch) {
  if (
    !session?.ownerId ||
    !session?.accessToken ||
    !isAllowedApiBase(base)
  )
    throw new Error("SYNC_SESSION_OR_HTTPS_REQUIRED");
  const rows = await pending(db, session.ownerId);
  if (!rows.length) return 0;
  const response = await fetcher(
    `${base.replace(/\/$/, "")}/offline-scans/sync`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${session.accessToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        captures: rows.map((row) => JSON.parse(row.payload)),
      }),
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "SIGN_IN_REQUIRED"
        : response.status === 409
          ? "SYNC_CONFLICT_RETAINED"
          : `SYNC_UNAVAILABLE_${response.status}`,
    );
  const data = await response.json();
  await acknowledge(
    db,
    session.ownerId,
    rows.map((r) => r.client_id),
    data.results,
  );
  return rows.length;
}

export async function pullChanges(db, session, base, fetcher = fetch) {
  if (
    !session?.ownerId ||
    !session?.accessToken ||
    !isAllowedApiBase(base)
  )
    throw new Error("SYNC_SESSION_OR_HTTPS_REQUIRED");
  const saved = await cursor(db, session.ownerId);
  const response = await fetcher(
    `${base.replace(/\/$/, "")}/offline-scans/changes?cursor=${encodeURIComponent(saved)}`,
    {
      headers: { authorization: `Bearer ${session.accessToken}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "SIGN_IN_REQUIRED"
        : `SYNC_UNAVAILABLE_${response.status}`,
    );
  const data = await response.json();
  await applyChanges(db, session.ownerId, data);
  return { received: data.changes.length, hasMore: data.hasMore === true };
}
