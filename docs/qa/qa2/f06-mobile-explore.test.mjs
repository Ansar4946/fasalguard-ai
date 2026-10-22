// F06 exploratory QA (node:test). Pure JS foundation only: NO real ONNX model, NO device. Run: node --test docs/qa/qa2/f06-mobile-explore.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
const root = join(dirname(fileURLToPath(import.meta.url)), "../../../mobile/src");
const inf = await import(join(root, "inference.mjs").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
const dbm = await import(join(root, "database.mjs").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
const syn = await import(join(root, "sync.mjs").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
const ses = await import(join(root, "session-contract.mjs").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
const pc = await import(join(root, "photo-crypto.mjs").replace(/\\/g, "/").replace(/^([A-Za-z]):/, "file:///$1:"));
const good = { runtime: "onnx", layout: "NCHW", resize: "stretch", sha256: "b".repeat(64), modelVersionId: "mv", cropId: "wheat", license: "x", evaluationReference: "y", width: 32, height: 32, classes: ["a", "b"], mean: [0, 0, 0], std: [1, 1, 1], output: "logits" };
const adapter = () => { const sql = new DatabaseSync(":memory:"); const db = { execAsync: async (q) => sql.exec(q), runAsync: async (q, ...a) => sql.prepare(q).run(...a), getAllAsync: async (q, ...a) => sql.prepare(q).all(...a), withExclusiveTransactionAsync: async (f) => { sql.exec("BEGIN"); try { await f(db); sql.exec("COMMIT"); } catch (e) { sql.exec("ROLLBACK"); throw e; } } }; return db; };
const cap = (id, extra = {}) => ({ clientId: id, fieldId: "f", cropSeasonId: "s", imageSha256: "a".repeat(64), capturedAt: "2026-10-14T00:00:00Z", prediction: null, ...extra });

test("manifest: 28 malformed variants are all rejected with MODEL_MANIFEST_INVALID", () => {
  const bad = [null, undefined, {}, { ...good, runtime: "tflite" }, { ...good, layout: "NHWC" }, { ...good, resize: "crop" }, { ...good, sha256: "B".repeat(64) }, { ...good, sha256: "b".repeat(63) }, { ...good, modelVersionId: "" }, { ...good, cropId: undefined }, { ...good, license: "" }, { ...good, evaluationReference: null }, { ...good, width: 31 }, { ...good, width: 513 }, { ...good, height: 224.5 }, { ...good, classes: ["only"] }, { ...good, classes: Array.from({ length: 201 }, (_, i) => "c" + i) }, { ...good, classes: ["a", "a"] }, { ...good, classes: ["a", ""] }, { ...good, classes: ["a", 5] }, { ...good, std: [1, 0, 1] }, { ...good, std: [1, -1, 1] }, { ...good, mean: [NaN, 0, 0] }, { ...good, mean: [Infinity, 0, 0] }, { ...good, mean: [0, 0] }, { ...good, output: "softmax" }, { ...good, mean: "012" }, { ...good, std: [1, 1, 1, 1] }];
  for (const [i, m] of bad.entries()) assert.throws(() => inf.validateManifest(m), /MODEL_MANIFEST_INVALID/, `variant ${i}`);
});

test("preprocessing: wrong length / missing buffer fail with a defined error, math is exact at extremes", () => {
  assert.throws(() => inf.pixelsToTensor(new Uint8Array(10), good), /IMAGE_SHAPE_INVALID/);
  assert.throws(() => inf.pixelsToTensor(undefined, good), /IMAGE_SHAPE_INVALID|TypeError|Cannot read/);
  const n = 32 * 32;
  const white = inf.pixelsToTensor(new Uint8Array(n * 4).fill(255), good);
  const black = inf.pixelsToTensor(new Uint8Array(n * 4), good);
  assert.equal(white[0], 1); assert.equal(black[0], 0); assert.equal(white.length, n * 3);
  assert.throws(() => inf.pixelsToTensor(new Uint8Array(n * 4).fill(255), { ...good, std: [Number.MIN_VALUE, 1, 1] }), /MODEL_PREPROCESSING_INVALID/);
});

test("output: NaN, Infinity, wrong length, bad probabilities all fail closed; huge logits stay finite", () => {
  for (const v of [[NaN, 1], [Infinity, 0], [1], [1, 2, 3]]) assert.throws(() => inf.predictionFromOutput(v, good), /MODEL_OUTPUT_INVALID/);
  const p = { ...good, output: "probabilities" };
  for (const v of [[0.5, 0.6], [-0.1, 1.1], [0.2, 0.2], [1.5, -0.5]]) assert.throws(() => inf.predictionFromOutput(v, p), /MODEL_OUTPUT_INVALID/);
  const r = inf.predictionFromOutput([1000, 0], good);
  assert.equal(r.label, "a"); assert.ok(Number.isFinite(r.score) && r.score <= 1);
  const r2 = inf.predictionFromOutput([-1000, -1001], good);
  assert.ok(Number.isFinite(r2.score));
});

test("output: an exact tie abstains (null prediction) instead of returning the first class", () => {
  assert.equal(inf.predictionFromOutput([0, 0], good), null);
});

test("no random or filename-derived prediction path exists in inference/database/sync sources", () => {
  for (const f of ["inference.mjs", "database.mjs", "sync.mjs"]) {
    const src = readFileSync(join(root, f), "utf8");
    assert.ok(!/Math\.random|crypto\.randomUUID|Date\.now\(\)\s*%/.test(src), f + " uses randomness");
  }
});

test("store: duplicate clientId, non-file image uri, missing owner are refused; account isolation holds", async () => {
  const db = adapter(); await dbm.initialize(db);
  await dbm.saveCapture(db, "A", cap("c1"), "file:///p.jpg");
  await assert.rejects(dbm.saveCapture(db, "A", cap("c1"), "file:///p.jpg"));
  await assert.rejects(dbm.saveCapture(db, "A", cap("c2"), "https://evil/x.jpg"), /CAPTURE_INVALID/);
  await assert.rejects(dbm.saveCapture(db, "", cap("c3"), "file:///p.jpg"), /CAPTURE_INVALID/);
  await dbm.saveCapture(db, "B", cap("c1"), "file:///q.jpg");
  assert.equal((await dbm.history(db, "A")).length, 1);
  assert.equal((await dbm.history(db, "B")).length, 1);
  assert.equal((await dbm.pending(db, "C")).length, 0);
});

test("store: outbox is capped at 20 per sync batch and history at 100 (no unbounded payload)", async () => {
  const db = adapter(); await dbm.initialize(db);
  for (let i = 0; i < 130; i++) await dbm.saveCapture(db, "A", cap("k" + i), "file:///p.jpg");
  assert.equal((await dbm.pending(db, "A")).length, 20);
  assert.equal((await dbm.history(db, "A")).length, 100);
});

test("store: untrusted prediction fields are persisted verbatim (server must validate); NaN score serialises to null", async () => {
  const db = adapter(); await dbm.initialize(db);
  await dbm.saveCapture(db, "A", cap("p1", { prediction: { label: "x", score: 9, modelSha256: "z" } }), "file:///p.jpg");
  await dbm.saveCapture(db, "A", cap("p2", { prediction: { label: "x", score: NaN } }), "file:///p.jpg");
  const rows = await dbm.history(db, "A");
  const p1 = JSON.parse(rows.find((r) => r.client_id === "p1").payload), p2 = JSON.parse(rows.find((r) => r.client_id === "p2").payload);
  assert.equal(p1.prediction.score, 9); // client does not clamp: finding recorded in report (server-side validation is the control)
  assert.equal(p2.prediction.score, null);
});

test("sync: refuses http://, blank token, and a null/undefined session without any fetch", async () => {
  const db = adapter(); await dbm.initialize(db);
  let called = 0; const f = async () => { called++; return new Response("{}"); };
  for (const [s, b] of [[{ ownerId: "A", accessToken: "t" }, "http://api.example"], [{ ownerId: "A", accessToken: "" }, "https://x"], [null, "https://x"], [{ ownerId: "", accessToken: "t" }, "https://x"], [{ ownerId: "A", accessToken: "t" }, undefined]])
    await assert.rejects(syn.syncPending(db, s, b, f), /SYNC_SESSION_OR_HTTPS_REQUIRED/);
  assert.equal(called, 0);
});

test("sync: server 500 / malformed JSON / ACK missing results retain every pending capture", async () => {
  const db = adapter(); await dbm.initialize(db);
  await dbm.saveCapture(db, "A", cap("s1"), "file:///p.jpg");
  const s = { ownerId: "A", accessToken: "t".repeat(40) };
  await assert.rejects(syn.syncPending(db, s, "https://x", async () => new Response("no", { status: 500 })), /SYNC_UNAVAILABLE_500/);
  await assert.rejects(syn.syncPending(db, s, "https://x", async () => new Response("not json", { status: 200 })));
  await assert.rejects(syn.syncPending(db, s, "https://x", async () => new Response("{}", { status: 200 })));
  await assert.rejects(syn.syncPending(db, s, "https://x", async () => new Response(JSON.stringify({ results: [{ clientId: "s1", status: "REJECTED" }] }), { status: 200 })));
  await assert.rejects(syn.syncPending(db, s, "https://x", async () => { throw new TypeError("network down"); }));
  assert.equal((await dbm.pending(db, "A")).length, 1, "capture lost");
  assert.equal((await syn.syncPending(db, s, "https://x", async () => new Response(JSON.stringify({ results: [{ clientId: "s1", status: "SYNCED", scanId: "srv" }] }), { status: 200 }))), 1);
  assert.equal((await dbm.pending(db, "A")).length, 0);
});

test("session contract: bad uuid, short token, oversized fields list, blank field name rejected", () => {
  const u = "11111111-1111-4111-8111-111111111111";
  const base = { ownerId: u, accessToken: "t".repeat(40), fields: [] };
  assert.equal(ses.validateSession(base), base);
  for (const v of [null, { ...base, ownerId: "x" }, { ...base, accessToken: "short" }, { ...base, accessToken: "t".repeat(8193) }, { ...base, fields: Array(501).fill({}) }, { ...base, fields: [{ fieldId: u, farmId: u, cropSeasonId: u, cropId: u, name: "  " }] }, { ...base, fields: [{ fieldId: "no", farmId: u, cropSeasonId: u, cropId: u, name: "n" }] }])
    assert.throws(() => ses.validateSession(v), /SESSION_INVALID/);
});

test("photo crypto: wrong owner/capture/key, bit-flip, truncation, oversize, bad key/nonce length all fail; roundtrip ok", () => {
  const key = new Uint8Array(32).fill(7), nonce = new Uint8Array(12).fill(3), bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
  const env = pc.encryptPhoto(bytes, key, nonce, "A", "c1");
  assert.deepEqual(Array.from(pc.decryptPhoto(env, key, "A", "c1")), Array.from(bytes));
  assert.throws(() => pc.decryptPhoto(env, key, "B", "c1"));
  assert.throws(() => pc.decryptPhoto(env, key, "A", "c2"));
  assert.throws(() => pc.decryptPhoto(env, new Uint8Array(32).fill(8), "A", "c1"));
  const flipped = env.slice(); flipped[20] ^= 1; assert.throws(() => pc.decryptPhoto(flipped, key, "A", "c1"));
  assert.throws(() => pc.decryptPhoto(env.slice(0, 20), key, "A", "c1"), /PHOTO_ENVELOPE_INVALID/);
  const v2 = env.slice(); v2[0] = 2; assert.throws(() => pc.decryptPhoto(v2, key, "A", "c1"), /PHOTO_ENVELOPE_INVALID/);
  assert.throws(() => pc.encryptPhoto(new Uint8Array(0), key, nonce, "A", "c1"), /PHOTO_ENCRYPTION_INPUT_INVALID/);
  assert.throws(() => pc.encryptPhoto(new Uint8Array(10 * 1024 * 1024 + 1), key, nonce, "A", "c1"), /PHOTO_ENCRYPTION_INPUT_INVALID/);
  assert.throws(() => pc.encryptPhoto(bytes, new Uint8Array(16), nonce, "A", "c1"), /PHOTO_ENCRYPTION_INPUT_INVALID/);
  assert.throws(() => pc.encryptPhoto(bytes, key, new Uint8Array(8), "A", "c1"), /PHOTO_ENCRYPTION_INPUT_INVALID/);
  assert.throws(() => pc.encryptPhoto([1, 2, 3], key, nonce, "A", "c1"), /PHOTO_ENCRYPTION_INPUT_INVALID/);
  const e2 = pc.encryptPhoto(bytes, key, new Uint8Array(12).fill(4), "A", "c1");
  assert.notDeepEqual(Array.from(env), Array.from(e2));
});

test("real model + device inference", { skip: "BLOCKED_EXTERNAL: no cleared ONNX model weights (bundled TFLite files are corrupt, PyTorch license 'other'), no Android/iOS device; no labelled Pakistan crop images" }, () => {});
