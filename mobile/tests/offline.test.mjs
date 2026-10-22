import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  initialize,
  saveCapture,
  history,
  pending,
  acknowledge,
  applyChanges,
  cursor,
} from "../src/database.mjs";
import { syncPending } from "../src/sync.mjs";
import {
  pixelsToTensor,
  predictionFromOutput,
  validateManifest,
} from "../src/inference.mjs";
import { validateSession } from "../src/session-contract.mjs";
import { encryptPhoto, decryptPhoto } from "../src/photo-crypto.mjs";

function adapter(path = ":memory:") {
  const sql = new DatabaseSync(path);
  const db = {
    execAsync: async (query) => sql.exec(query),
    runAsync: async (query, ...args) => sql.prepare(query).run(...args),
    getAllAsync: async (query, ...args) => sql.prepare(query).all(...args),
    withExclusiveTransactionAsync: async (action) => {
      sql.exec("BEGIN");
      try {
        await action(db);
        sql.exec("COMMIT");
      } catch (error) {
        sql.exec("ROLLBACK");
        throw error;
      }
    },
    close: () => sql.close(),
  };
  return db;
}
const capture = {
  clientId: "id-1",
  fieldId: "field",
  cropSeasonId: "season",
  imageSha256: "a".repeat(64),
  capturedAt: "2026-10-14T00:00:00Z",
  prediction: null,
};
const session = { ownerId: "owner", accessToken: "synthetic-test-session" };

test("real SQLite persists history/outbox across database restart and isolates accounts", async () => {
  const directory = mkdtempSync(join(tmpdir(), "f06-"));
  let db = adapter(join(directory, "db.sqlite"));
  try {
    await initialize(db);
    await saveCapture(db, "owner", capture, "file:///private/photo.jpg");
    db.close();
    db = adapter(join(directory, "db.sqlite"));
    assert.equal((await history(db, "owner")).length, 1);
    assert.equal((await pending(db, "owner")).length, 1);
    assert.equal((await history(db, "stranger")).length, 0);
    await assert.rejects(
      saveCapture(db, "owner", capture, "file:///private/photo.jpg"),
    );
    assert.equal((await pending(db, "owner")).length, 1);
  } finally {
    db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("simulated offline transport, expired auth, conflict and server outage retain pending history", async () => {
  for (const status of [0, 401, 409, 503]) {
    const db = adapter();
    try {
      await initialize(db);
      await saveCapture(db, "owner", capture, "file:///private/photo.jpg");
      await assert.rejects(
        syncPending(db, session, "https://test.invalid", async () => {
          if (!status) throw new Error("offline");
          return { ok: false, status };
        }),
      );
      assert.equal((await pending(db, "owner")).length, 1);
      assert.equal((await history(db, "owner"))[0].state, "PENDING");
    } finally {
      db.close();
    }
  }
});
test("ACK is validated in full before any SQLite record is marked synced", async () => {
  const db = adapter();
  try {
    await initialize(db);
    await saveCapture(db, "owner", capture, "file:///private/photo.jpg");
    for (const results of [
      [],
      [{ clientId: "other", status: "SYNCED", scanId: "s" }],
      [{ clientId: "id-1", status: "FAILED", scanId: "s" }],
    ]) {
      await assert.rejects(acknowledge(db, "owner", ["id-1"], results));
      assert.equal((await pending(db, "owner")).length, 1);
    }
    await syncPending(
      db,
      session,
      "https://test.invalid",
      async (_url, request) => {
        assert.equal(JSON.parse(request.body).captures[0].clientId, "id-1");
        return {
          ok: true,
          json: async () => ({
            results: [
              { clientId: "id-1", status: "SYNCED", scanId: "server-scan" },
            ],
          }),
        };
      },
    );
    assert.equal((await pending(db, "owner")).length, 0);
    assert.equal((await history(db, "owner"))[0].server_id, "server-scan");
  } finally {
    db.close();
  }
});
test("sync refuses plaintext transport and missing identity", async () => {
  await assert.rejects(syncPending(null, session, "http://test.invalid"));
  await assert.rejects(syncPending(null, null, "https://test.invalid"));
});
test("pull metadata and cursor commit together, account cursors remain isolated", async () => {
  const db = adapter();
  try {
    await initialize(db);
    await applyChanges(db, "owner", {
      cursor: "17",
      changes: [{ clientId: capture.clientId, scanId: "s", capture }],
    });
    assert.equal((await history(db, "owner"))[0].state, "SYNCED");
    assert.equal(await cursor(db, "owner"), "17");
    assert.equal(await cursor(db, "stranger"), "0");
    await assert.rejects(
      applyChanges(db, "owner", { cursor: "16", changes: [] }),
    );
    assert.equal(await cursor(db, "owner"), "17");
  } finally {
    db.close();
  }
});
test("conflicting pull keeps local payload and cursor, including earlier records in the page", async () => {
  const db = adapter();
  try {
    await initialize(db);
    await saveCapture(db, "owner", capture, "file:///private/photo.jpg");
    const changed = { ...capture, imageSha256: "b".repeat(64) };
    await assert.rejects(
      applyChanges(db, "owner", {
        cursor: "5",
        changes: [
          {
            clientId: "new-id",
            scanId: "s2",
            capture: { ...capture, clientId: "new-id" },
          },
          { clientId: capture.clientId, scanId: "s", capture: changed },
        ],
      }),
    );
    assert.equal((await history(db, "owner")).length, 1);
    assert.equal((await history(db, "owner"))[0].state, "PENDING");
    assert.equal(await cursor(db, "owner"), "0");
  } finally {
    db.close();
  }
});
// Synthetic tensor fixtures test math only. They do not represent a crop model or disease predictions.
const manifest = {
  modelVersionId: "test-model",
  modelId: "synthetic",
  version: "test",
  cropId: "test-crop",
  license: "TEST_FIXTURE_ONLY",
  evaluationReference: "unit arithmetic only",
  sha256: "a".repeat(64),
  runtime: "onnx",
  width: 32,
  height: 32,
  classes: ["test-dark", "test-light"],
  mean: [0, 0, 0],
  std: [1, 1, 1],
  layout: "NCHW",
  output: "logits",
  resize: "stretch",
};
test("preprocessing reads RGB pixels into the documented NCHW tensor", () => {
  const dark = pixelsToTensor(new Uint8Array(32 * 32 * 4), manifest),
    light = pixelsToTensor(new Uint8Array(32 * 32 * 4).fill(255), manifest);
  assert.equal(dark.length, 3072);
  assert.equal(dark[0], 0);
  assert.equal(light[0], 1);
  assert.notDeepEqual(dark, light);
  const rgb = new Uint8Array(32 * 32 * 4);
  rgb[0] = 255;
  rgb[1] = 128;
  const tensor = pixelsToTensor(rgb, manifest);
  assert.equal(tensor[0], 1);
  assert(Math.abs(tensor[1024] - 128 / 255) < 1e-6);
});
test("invalid manifest, output shape and nonfinite model scores fail closed", () => {
  for (const invalid of [
    { ...manifest, sha256: "bad" },
    { ...manifest, std: [0, 1, 1] },
    { ...manifest, classes: ["a", "a"] },
    null,
  ])
    assert.throws(() => validateManifest(invalid));
  assert.throws(() => pixelsToTensor(new Uint8Array(4), manifest));
  assert.throws(() => predictionFromOutput([NaN, 1], manifest));
  assert.throws(() => predictionFromOutput([1], manifest));
  assert.throws(() =>
    predictionFromOutput([0.8, 0.8], { ...manifest, output: "probabilities" }),
  );
  const result = predictionFromOutput([0, 1], manifest);
  assert.equal(result.label, "test-light");
  assert(result.score > 0 && result.score < 1);
  assert.equal(predictionFromOutput([0, 0], manifest), null);
  assert.equal(
    predictionFromOutput([0.5, 0.5], { ...manifest, output: "probabilities" }),
    null,
  );
  assert.throws(() =>
    pixelsToTensor(new Uint8Array(32 * 32 * 4).fill(255), {
      ...manifest,
      std: [1e-300, 1, 1],
    }),
  );
  assert.throws(() =>
    pixelsToTensor(new Uint8Array(32 * 32 * 4), {
      ...manifest,
      mean: [1e300, 0, 0],
    }),
  );
});
test("cached sessions reject malformed field/season/crop identities and names", () => {
  const id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    field = {
      fieldId: id,
      farmId: id,
      cropSeasonId: id,
      cropId: id,
      name: "Synthetic parcel",
    };
  const value = {
    ownerId: id,
    accessToken: "synthetic-session-token-with-at-least-32-characters",
    fields: [field],
  };
  assert.equal(validateSession(value).fields[0].name, "Synthetic parcel");
  for (const invalid of [
    null,
    { ...value, ownerId: "../escape" },
    { ...value, fields: [null] },
    { ...value, fields: [{ ...field, cropSeasonId: "bad" }] },
    { ...value, fields: [{ ...field, name: 7 }] },
  ])
    assert.throws(() => validateSession(invalid));
});
test("retained photo encryption authenticates bytes, account and capture identity", () => {
  const bytes = new Uint8Array([255, 216, 255, 9, 8, 7]),
    key = new Uint8Array(32).fill(7),
    nonce = new Uint8Array(12).fill(9);
  const encrypted = encryptPhoto(bytes, key, nonce, "owner", "capture");
  assert.notDeepEqual(encrypted.slice(13, 19), bytes);
  assert.deepEqual(decryptPhoto(encrypted, key, "owner", "capture"), bytes);
  assert.throws(() => decryptPhoto(encrypted, key, "stranger", "capture"));
  assert.throws(() => decryptPhoto(encrypted, key, "owner", "other"));
  encrypted[14] ^= 1;
  assert.throws(() => decryptPhoto(encrypted, key, "owner", "capture"));
});
