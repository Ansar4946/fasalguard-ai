# Real Feedback Collection

**Date:** 2026-08-19
**Status:** Real, persisted, unit-tested, and live-verified against the running stack (including a full seed-consent-publish-unpublish cycle).

## What this activates

`user_feedback` (created earlier this session, zero writers until then) is extended into the real thing: structured Yes/No feedback tied to four specific, real completed events, with an admin-curated, never-auto-published testimonial pipeline.

## Trigger surfaces — honest about what's real

Only **incident resolution** has real, connected frontend UI today (`farm-incidents-panel.tsx`) — the feedback prompt appears inline right after a farmer records a follow-up that resolves an incident. Farm Brain ("roadmap") has zero frontend UI anywhere in this codebase, the weekly report is email-only, and the crop-scan results page is mocked (reads from `mockDiagnosisRepository`, disconnected from the real diagnosis pipeline — a separate, pre-existing gap, not fixed here). For those three, the ask is triggered honestly via a real deep link embedded in the lifecycle email that already fires for that exact event (`sendRoadmapReady`, `sendInsightReady`, `sendWeeklySummary`), landing on a shared `/feedback` page — not a downgrade, a standard real mechanism, and not a fabricated UI attachment point.

## Anti-fabrication: every submission is validated against the real record

`FeedbackService.submitEvent()` never trusts the client's claim that an event happened — before accepting, it checks:
- `ROADMAP_COMPLETION` → a real `farm_brain_runs` row, owned by the caller, `status='COMPLETED'`.
- `INCIDENT_RESOLUTION` → a real `farm_incidents` row, owned via `farms→farmer_profiles`, `state='RESOLVED'`.
- `CROP_DIAGNOSIS` → a real `crop_scans` row, owned by the caller, `status='DIAGNOSED'`.
- `WEEKLY_REPORT` → a real `lifecycle_email_log` row for that user, `WEEKLY_SUMMARY`, sent within 14 days.

Live-verified: a fabricated/nonexistent context id returns a real `404`; a well-formed incident id that isn't actually resolved is rejected the same way.

## Never auto-publish — enforced twice

1. **App layer**: `publish()` rejects (403) any row where `consent_to_quote` is false.
2. **DB layer**: `CHECK(published_at IS NULL OR consent_to_quote=true)` — publishing without consent is structurally impossible, not just app-logic-dependent.

Publishing is always a separate, explicit admin action (`POST /admin/feedback/:id/publish`) — consent alone never publishes anything. Live-verified: a real consented+positive row was published, appeared on the real public `GET /growth/testimonials` endpoint, was unpublished, and disappeared again; a real non-consented row was confirmed un-publishable (403).

## Admin report (`/admin/feedback`)

`feedbackCount`, `positiveRate` (`useful=true` / `useful` answered), `featureBreakdown` (count + positive rate per feature), `testimonialCandidateCount` (consented + positive + not yet published), `publishedCount` — all excluding `is_test_account`, live-verified to correctly move a row from candidate → published and back.

## Storage

`user_feedback` gained `farm_id`, `useful` (the required Yes/No), `would_recommend`, `public_reference_url`, `published_at`/`published_by`. `consent_to_quote` (already existed) is reused as `permissionToQuote`; `context_type` (already existed, 4 new enum members added) is exposed to the API as `feature`; `feedback` (already existed, now nullable) stores the optional "what helped"/"what should improve" answers, concatenated with labels rather than adding two more columns.

## Verification performed

- 10 unit tests (`feedback.service.spec.ts`) covering validation rejection per feature, farm-id derivation, publish-without-consent rejection, and report math on both an empty and a populated cohort.
- Full live walkthrough against the real stack: seeded a real resolved incident and a real diagnosed-scan-less weekly-report gap, confirmed both the accept and reject paths for event validation, submitted real feedback, confirmed it counted correctly in the admin report and appeared as a testimonial candidate, published it and confirmed it appeared on the public testimonials endpoint, confirmed a non-consented row could not be published, unpublished, and confirmed `is_test_account` exclusion held throughout (temporarily un-flagged one real account to prove the positive-count path works, then re-flagged it).
- Full backend suite re-run: 152/153 passing (1 pre-existing, unrelated failure).
