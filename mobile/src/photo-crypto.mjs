import { gcm } from "@noble/ciphers/aes.js";
import { utf8ToBytes } from "@noble/ciphers/utils.js";

// AES-256-GCM. Native callers provide a SecureStore key and fresh Expo CSPRNG nonce.
export function encryptPhoto(bytes, key, nonce, ownerId, clientId) {
  if (
    !(bytes instanceof Uint8Array) ||
    !bytes.length ||
    bytes.length > 10 * 1024 * 1024 ||
    key.length !== 32 ||
    nonce.length !== 12 ||
    !ownerId ||
    !clientId
  )
    throw new Error("PHOTO_ENCRYPTION_INPUT_INVALID");
  const encrypted = gcm(
    key,
    nonce,
    utf8ToBytes(JSON.stringify([ownerId, clientId])),
  ).encrypt(bytes);
  const result = new Uint8Array(1 + 12 + encrypted.length);
  result[0] = 1;
  result.set(nonce, 1);
  result.set(encrypted, 13);
  return result;
}
export function decryptPhoto(bytes, key, ownerId, clientId) {
  if (
    bytes.length < 30 ||
    bytes.length > 10 * 1024 * 1024 + 29 ||
    bytes[0] !== 1 ||
    key.length !== 32
  )
    throw new Error("PHOTO_ENVELOPE_INVALID");
  return gcm(
    key,
    bytes.slice(1, 13),
    utf8ToBytes(JSON.stringify([ownerId, clientId])),
  ).decrypt(bytes.slice(13));
}
