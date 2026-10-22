# Independent F05 review — 2026-10-14

Reviewer: separate Codex agent `/root/f02_review`, read-only source and evidence review, requested by the user acceptance workflow.

Findings and fixes:
- Export field/vertex precheck and geometry read could race with imports: now use the shared farm transaction lock and recheck ownership before counting/reading.
- Import retry key was cleared before reload succeeded: retain file/key until reload success. Browser test simulates successful POST followed by reload503 and verifies same field IDs on retry; DB shows one receipt.
- Satellite overlay displayed only the exterior: boundary and zone rendering now use polygonRings.

Re-review confirmed all three fixes and found no remaining material source blocker. Minor note: generic IntegrityError mapping could distinguish unrelated constraint conflicts from duplicate field names more precisely.

Final evidence reviewed: API209unit passes, core14integration passes/clean exit0, platform201unit passes6skips, F05geometry37passes plus separately executed cross-service pass, webbuild and migration logs exit0, production-onlyAPI audit0, eight browser checks and matching PostGIS proof. Subsequent aggregate feature run supplied the core endpoint and passed all38 without skips.

Verdict: RUN_PASS for the tested F05 slice. GPS is simulated. Physical GPS, cadastral accuracy, HTTPS/live provider policies, development dependency review, native offline functionality and large exports remain outside this signoff. No production-readiness certification.
