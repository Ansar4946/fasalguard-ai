// The same SQL runs in expo-sqlite and in real SQLite unit/integration tests.
export async function initialize(db) {
  await db.execAsync(`PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS offline_captures(owner_id TEXT NOT NULL,client_id TEXT NOT NULL,
    payload TEXT NOT NULL,image_uri TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'PENDING',server_id TEXT,
    PRIMARY KEY(owner_id,client_id));
    CREATE TABLE IF NOT EXISTS offline_sync_cursors(owner_id TEXT PRIMARY KEY,cursor TEXT NOT NULL);`);
}
export async function saveCapture(db, owner, capture, imageUri) {
  if (!owner || !capture.clientId || !imageUri.startsWith("file:"))
    throw new Error("CAPTURE_INVALID");
  await db.runAsync(
    "INSERT INTO offline_captures(owner_id,client_id,payload,image_uri) VALUES(?,?,?,?)",
    owner,
    capture.clientId,
    JSON.stringify(capture),
    imageUri,
  );
}
export async function history(db, owner) {
  return db.getAllAsync(
    "SELECT client_id,payload,image_uri,state,server_id FROM offline_captures WHERE owner_id=? ORDER BY rowid DESC LIMIT 100",
    owner,
  );
}
export async function pending(db, owner) {
  return db.getAllAsync(
    "SELECT client_id,payload FROM offline_captures WHERE owner_id=? AND state='PENDING' ORDER BY rowid LIMIT 20",
    owner,
  );
}
export async function acknowledge(db, owner, ids, results) {
  if (
    !Array.isArray(results) ||
    results.length !== ids.length ||
    new Set(results.map((x) => x.clientId)).size !== ids.length ||
    results.some(
      (x) =>
        !ids.includes(x.clientId) ||
        x.status !== "SYNCED" ||
        typeof x.scanId !== "string",
    )
  )
    throw new Error("SYNC_RESPONSE_INVALID");
  await db.withExclusiveTransactionAsync(async (tx) => {
    for (const result of results)
      await tx.runAsync(
        "UPDATE offline_captures SET state='SYNCED',server_id=? WHERE owner_id=? AND client_id=? AND state='PENDING'",
        result.scanId,
        owner,
        result.clientId,
      );
  });
}

function canonicalCapture(payload) {
  const value = typeof payload === "string" ? JSON.parse(payload) : payload;
  const normalized = {
    ...value,
    capturedAt: new Date(value.capturedAt).toISOString(),
  };
  const sorted = (x) =>
    Array.isArray(x)
      ? x.map(sorted)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, sorted(v)]),
          )
        : x;
  return JSON.stringify(sorted(normalized));
}
export async function cursor(db, owner) {
  const rows = await db.getAllAsync(
    "SELECT cursor FROM offline_sync_cursors WHERE owner_id=?",
    owner,
  );
  return rows[0]?.cursor ?? "0";
}
export async function applyChanges(db, owner, data) {
  if (
    !owner ||
    !data ||
    typeof data.cursor !== "string" ||
    !/^\d{1,19}$/.test(data.cursor) ||
    BigInt(data.cursor) > 9223372036854775807n ||
    !Array.isArray(data.changes) ||
    data.changes.length > 100 ||
    data.changes.some(
      (x) =>
        typeof x?.scanId !== "string" ||
        typeof x.clientId !== "string" ||
        x.capture?.clientId !== x.clientId ||
        !Number.isFinite(Date.parse(x.capture?.capturedAt)) ||
        typeof x.capture?.imageSha256 !== "string" ||
        !/^[a-f0-9]{64}$/.test(x.capture.imageSha256) ||
        typeof x.capture.fieldId !== "string" ||
        typeof x.capture.cropSeasonId !== "string" ||
        (x.capture.prediction !== null &&
          (!x.capture.prediction ||
            typeof x.capture.prediction.label !== "string" ||
            !x.capture.prediction.label ||
            x.capture.prediction.label.length > 200 ||
            !Number.isFinite(x.capture.prediction.score) ||
            x.capture.prediction.score < 0 ||
            x.capture.prediction.score > 1)),
    )
  )
    throw new Error("SYNC_RESPONSE_INVALID");
  await db.withExclusiveTransactionAsync(async (tx) => {
    const previous = await cursor(tx, owner);
    if (BigInt(data.cursor) < BigInt(previous))
      throw new Error("SYNC_CURSOR_REWIND");
    for (const item of data.changes) {
      const existing = await tx.getAllAsync(
        "SELECT payload FROM offline_captures WHERE owner_id=? AND client_id=?",
        owner,
        item.clientId,
      );
      if (
        existing.length &&
        canonicalCapture(existing[0].payload) !== canonicalCapture(item.capture)
      ) {
        // Retain conflicting original payload; do not silently advance its history or cursor.
        throw new Error("SYNC_CONFLICT_RETAINED");
      }
      await tx.runAsync(
        "INSERT INTO offline_captures(owner_id,client_id,payload,image_uri,state,server_id) VALUES(?,?,?,'','SYNCED',?) ON CONFLICT(owner_id,client_id) DO UPDATE SET state='SYNCED',server_id=excluded.server_id",
        owner,
        item.clientId,
        JSON.stringify(item.capture),
        item.scanId,
      );
    }
    await tx.runAsync(
      "INSERT INTO offline_sync_cursors(owner_id,cursor) VALUES(?,?) ON CONFLICT(owner_id) DO UPDATE SET cursor=excluded.cursor",
      owner,
      data.cursor,
    );
  });
}
