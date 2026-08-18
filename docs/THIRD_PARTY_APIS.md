# Third-Party APIs Required for Production

Verified 2026-08-17 against each provider's current official documentation. Every URL below was checked live, not assumed — re-verify numeric limits against the live dashboards noted, since Google and Copernicus in particular don't publish fixed tables anymore.

The backend already has a provider abstraction for every category below (`services/api/src/config/environment.ts` / `configuration.ts`) — none of this requires new code, only credentials in a git-ignored `.env` (never `.env.example`, which is already compromised — see `docs/AUTH_SECURITY_AUDIT.md`).

## 1. Weather — Open-Meteo (already integrated, works today)

- **No signup, no API key.** Docs/pricing: https://open-meteo.com/en/pricing
- **Free tier**: 10,000 calls/day, 5,000/hour, 600/minute, 300,000/month, best-effort (no SLA).
- **⚠️ Licensing gotcha**: the free tier is licensed for **non-commercial use only** (CC BY 4.0, attribution required). A commercial product should budget for a paid plan (~1M calls/month, no daily cap, includes commercial licence) before real launch — flag this to the team as a decision point, not an oversight.

## 2. Satellite imagery — Copernicus Data Space Ecosystem (Sentinel Hub)

- **Signup**: https://dataspace.copernicus.eu/ (free, no credit card) → OAuth client dashboard at https://shapps.dataspace.copernicus.eu/dashboard/#/ (User Settings → OAuth clients) generates `SENTINEL_HUB_CLIENT_ID`/`SENTINEL_HUB_CLIENT_SECRET`.
- **Free tier**: 10,000 requests/month, 10,000 processing units/month, capped at 300 req/min and 300 PU/min. Exceeding quota throttles rather than hard-blocks.
- This is the correct **current** replacement for the legacy commercial sentinel-hub.com signup — some older blog posts cite a "40,000 PU" figure that no longer matches official docs; use the 10,000/month number.

## 3. Gemini — Google AI Studio (farm-brain reasoning)

- **Signup (no GCP project needed)**: https://aistudio.google.com/apikey → sets `GEMINI_API_KEY`, `GEMINI_TRANSPORT=google-ai`.
- **Free tier**: no fixed published table anymore — check live at https://aistudio.google.com/rate-limit. Commonly reported current figures for `gemini-3.6-flash`: ~10 RPM, ~250K TPM, ~250 RPD (gemini-3.6-flash-lite is higher, ~1,000 RPD). Treat as indicative, not contractual.
- **⚠️ Privacy gotcha**: Google's pricing page confirms free-tier prompts/responses **are used to improve Google products** (paid tier isn't) — worth a real conversation before sending farm/user data through the free tier.
- **Paid/enterprise path** (`GEMINI_TRANSPORT=vertex`): needs a GCP project + billing account. New accounts get $300/90-day credit, but production requires billing enabled either way.

## 4. Vision / crop diagnosis — Roboflow

- **Signup**: https://app.roboflow.com/login · pricing: https://roboflow.com/pricing → sets `ROBOFLOW_API_KEY`, `VISION_PROVIDER=roboflow`.
- **Free tier ("Public" plan)**: no card required, **$60/month in credits** (training/storage/inference), but projects on this plan are **public** on Roboflow Universe. Paid "Core" plan starts ~$79-99/mo for private projects.
- **Pretrained models available**: https://universe.roboflow.com/browse/agriculture hosts community-trained crop/plant-disease detection models usable via API without training your own — quality varies since they're community-contributed, not Roboflow-official. Worth evaluating before committing to build/train a custom model, but validate accuracy carefully before relying on one for real diagnosis (this app explicitly needs to avoid overclaiming diagnostic certainty per `docs/SATELLITE_INGESTION.md`'s non-diagnostic-labels precedent — the same caution applies to vision output).
- **Alternative**: the code's `self-hosted` vision provider path requires building real `/v1/vision/quality` and `/v1/vision/predict` endpoints (currently absent from `services/geospatial-ai`) — see `docs/PRODUCTION_BLOCKERS.md`.

## 5. Assistant / Q&A — Qwen

- **Signup (international)**: https://bailian.console.alibabacloud.com/ → sets `QWEN_API_KEY`, `QWEN_BASE_URL=https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.
- **Free tier**: 1,000,000 tokens per eligible model (e.g. qwen-plus), valid **90 days** from activation — time-limited, not perpetual. After exhaustion, unverified accounts are blocked until identity verification + funds added.
- **Free-tier-friendly alternative**: https://openrouter.ai/ hosts Qwen models including free-tagged variants (e.g. `qwen/qwen3-coder:free`) — 20 req/min, 50 req/day unfunded or up to 1,000 req/day after a one-time $10 top-up. Worth considering for longer-term free access than Alibaba's 90-day window.

## 6. Object storage — Alibaba OSS (+ alternatives)

- **Alibaba OSS signup**: https://www.alibabacloud.com/en/product/object-storage-service · free-tier doc: https://www.alibabacloud.com/help/en/oss/free-quota-for-new-users → sets `OSS_ACCESS_KEY_ID`/`OSS_ACCESS_KEY_SECRET`/`OSS_REGION`/`OSS_BUCKET`.
- **Free tier**: 20 GB (Standard LRS) for 3 months on eligible new/verified accounts, plus a recurring 5 GB/month in supported regions. Requires identity verification + payment method on file even during the free period.
- **Alternatives** (would need a new storage adapter — code currently only implements Alibaba OSS, see `services/api/src/domain/media/storage/`):
  - **Cloudflare R2** — https://dash.cloudflare.com/ (→ R2). 10 GB storage + 1M Class A (write) + 10M Class B (read) ops/month free, **recurring monthly, zero egress fees** — best ongoing free tier of the three, though a card is required to activate R2.
  - **AWS S3** — https://aws.amazon.com/s3/. Terms changed recently: accounts created before 2025-07-15 get the legacy 12-month free tier (5 GB + 20K GET/2K PUT/month); newer accounts get a $200-credit Free Plan model instead. Verify current terms at signup.

## 7. Push notifications — Firebase Cloud Messaging

- **Signup**: https://console.firebase.google.com/ → Project Settings → Service Accounts → Generate new private key → base64-encode → `FIREBASE_SERVICE_ACCOUNT_BASE64`.
- **Free tier**: genuinely **free and unlimited** on both Spark and Blaze plans — no per-message charge, no cap, works for commercial use. The one category here with no real gotcha.

## 8. Email/SMTP

- **(a) Gmail SMTP via App Password** (fastest for dev/testing): https://myaccount.google.com/apppasswords (requires 2-Step Verification enabled first at https://myaccount.google.com/security). Free, ~500 recipients/24h rolling window for a personal account. Not designed for production transactional volume; risk of temporary suspension if abused.
- **(b) Resend** (best free-tier numbers for production): https://resend.com — 3,000 emails/month, capped at 100/day, 1 verified domain.
- **(c) Brevo** (better daily cap, lower monthly ceiling): https://www.brevo.com — 300 emails/day (~9,000/month), unlimited contacts, no time limit.
- **(d) Mailgun** (most setup friction): https://www.mailgun.com/pricing — 100/day free, but new accounts are sandbox-restricted to 5 authorized recipients until a card is added.
- **Recommendation**: Resend for production (simplicity + best numbers), Gmail App Password only for low-volume dev/testing — this is exactly the gap blocking the onboarding password email right now (see `docs/PRODUCTION_BLOCKERS.md`).

## Not needed

**Payment/subscriptions**: no payment provider is required yet — the codebase has `subscriptions`/`subscription_payments` tables but no controller and no payment integration anywhere (confirmed in the earlier audit). This becomes relevant only once monetization is actually built (`docs/API_PRODUCTION_CHECKLIST.md` Part 2).

## Summary table

| Category | Provider | Signup | Free tier | Card required? |
|---|---|---|---|---|
| Weather | Open-Meteo | none needed | 10K/day (non-commercial licence) | No |
| Satellite | Copernicus Data Space | dataspace.copernicus.eu | 10K req + 10K PU/month | No |
| AI reasoning | Google AI Studio (Gemini) | aistudio.google.com/apikey | ~250 RPD (indicative, check dashboard) | No |
| Vision | Roboflow | app.roboflow.com | $60/mo credits, public projects only | No |
| Assistant | Qwen (DashScope Intl) | bailian.console.alibabacloud.com | 1M tokens / 90 days | No (until quota used) |
| Assistant (alt.) | OpenRouter | openrouter.ai | 50/day free, 1,000/day after $10 top-up | Only for higher tier |
| Storage | Alibaba OSS | alibabacloud.com | 20GB/3mo + 5GB/mo recurring | Yes |
| Storage (alt.) | Cloudflare R2 | dash.cloudflare.com | 10GB + 1M/10M ops/month, recurring | Yes (to activate) |
| Push | Firebase FCM | console.firebase.google.com | Unlimited | No |
| Email (dev) | Gmail App Password | myaccount.google.com/apppasswords | ~500/day | No |
| Email (prod) | Resend | resend.com | 3,000/month, 100/day | Check at signup |
