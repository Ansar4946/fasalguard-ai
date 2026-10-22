import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { initialize, saveCapture } from "./database.mjs";
import type { Session } from "./session";
import { encryptPhoto } from "./photo-crypto.mjs";

const pendingKeys = new Map<string, Promise<string>>();
function storageKey(name: string): Promise<string> {
  const existing = pendingKeys.get(name);
  if (existing) return existing;
  const operation = (async () => {
    let key = await SecureStore.getItemAsync(name);
    if (!key) {
      key = Array.from(Crypto.getRandomBytes(32))
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      await SecureStore.setItemAsync(name, key);
    }
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("LOCAL_KEY_INVALID");
    return key;
  })();
  pendingKeys.set(name, operation);
  void operation
    .finally(() => {
      if (pendingKeys.get(name) === operation) pendingKeys.delete(name);
    })
    .catch(() => {});
  return operation;
}

export async function openStore() {
  const key = await storageKey("fasalguard.offline.db-key.v1");
  const db = await SQLite.openDatabaseAsync("fasalguard-offline.db");
  try {
    await db.execAsync(`PRAGMA key = "x'${key}'";`);
    const version = await db.getFirstAsync<{ cipher_version: string }>(
      "PRAGMA cipher_version",
    );
    if (!version?.cipher_version)
      throw new Error("ENCRYPTED_DATABASE_UNAVAILABLE");
    await initialize(db);
    return db;
  } catch (error) {
    await db.closeAsync();
    throw error;
  }
}
export async function sha256(bytes: Uint8Array) {
  const digest = await Crypto.digest(
    Crypto.CryptoDigestAlgorithm.SHA256,
    new Uint8Array(bytes),
  );
  return Array.from(new Uint8Array(digest))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function capture(
  db: SQLite.SQLiteDatabase,
  session: Session,
  field: Session["fields"][number],
  sourceUri: string,
  prediction: object | null = null,
) {
  if (
    !/^[a-f0-9-]{36}$/i.test(session.ownerId) ||
    !session.fields.some(
      (x) =>
        x.fieldId === field.fieldId && x.cropSeasonId === field.cropSeasonId,
    )
  )
    throw new Error("CAPTURE_CONTEXT_INVALID");
  const source = new File(sourceUri);
  if (!source.exists || source.size <= 0 || source.size > 10 * 1024 * 1024)
    throw new Error("IMAGE_SIZE_INVALID");
  const clientId = Crypto.randomUUID();
  const directory = new Directory(
    Paths.document,
    "offline-captures",
    session.ownerId,
  );
  directory.create({ intermediates: true, idempotent: true });
  const retained = new File(directory, `${clientId}.fgenc`);
  const photoKey = await storageKey(`fasalguard.photo-key.${session.ownerId}`);
  const key = Uint8Array.from(photoKey.match(/.{2}/g)!, (x) =>
    Number.parseInt(x, 16),
  );
  const bytes = await source.bytes();
  try {
    retained.create();
    retained.write(
      encryptPhoto(
        bytes,
        key,
        Crypto.getRandomBytes(12),
        session.ownerId,
        clientId,
      ),
    );
    const value = {
      clientId,
      fieldId: field.fieldId,
      cropSeasonId: field.cropSeasonId,
      capturedAt: new Date().toISOString(),
      imageSha256: await sha256(bytes),
      prediction,
    };
    await saveCapture(db, session.ownerId, value, retained.uri);
    return value;
  } catch (error) {
    if (retained.exists) retained.delete();
    throw error;
  } finally {
    key.fill(0);
    bytes.fill(0);
  }
}
