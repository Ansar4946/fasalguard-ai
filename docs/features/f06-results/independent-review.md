# Independent F06 review

2026-10-14, separate Codex agent /root/f02_review, read-only source review.

Initial findings: plaintext retained JPEGs despite metadata encryption; possible Float32
normalization overflow; malformed cached field entries accepted. Fixes reviewed: authenticated
AES256-GCM .fgenc photo envelopes with owner/capture AAD and separate SecureStore keys;
finite Float32 checks; strict field/farm/season/crop UUID and name validation. Native key
creation is serialized. Host crypto/session/overflow tests added.

Re-review: no remaining material source blocker for the disabled foundation. Server ownership,
atomic batches, immutable idempotency and owner-scoped cursor design look coherent; client
predictions do not become verified diagnoses. Current history is metadata only.

Full F06 remains BLOCKED_EXTERNAL: no cleared model weights, secure sign-in integration,
native encrypted-storage/device acceptance, APK, real database/migration/sync evidence or
production dependency clearance. Source review and host tests do not prove native operation.
