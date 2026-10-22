# F09 Pakistan USSD provider onboarding

Date checked: 2026-10-15  
Status: **BLOCKED_EXTERNAL — commercial and technical provider contract required**

## Verified provider candidates

### Jazz Business Interact

Jazz publicly offers two-way, session-based USSD under its Interact product, including dial-in codes, order confirmation and transaction authentication. This establishes that an appropriate Pakistan service exists. Its public page does not publish callback fields, request signing, replay identifiers, response format, timeout/retry behavior, sandbox access, pricing, or short-code provisioning terms.

Primary source: https://jazz.com.pk/business/solutions/messaging-solutions/ussd-based-comms

Published contact routes:

- Jazz Business contact form on the product page
- Business Care: `03000-160-160`
- Existing-customer Business World and Business WhatsApp channels listed on the page

### Infobip

Infobip's service description names XML and REST/JSON USSD gateway interfaces. Its current webhook-subscription documentation supports HMAC over the exact raw request body through `X-Hub-Signature`, with a configured algorithm such as HMAC-SHA-256. Public evidence reviewed here does not prove that Infobip currently supplies Pakistan USSD short codes, and the public documentation does not expose the USSD session payload/response schema needed for an implementation.

Primary sources:

- https://www.infobip.com/policies/service-description
- https://www.infobip.com/docs/subscriptions/subscription-components

## Information required from a provider

Do not enable a live adapter until the provider supplies all of the following in writing:

1. Pakistan network coverage: Jazz, Zong, Ufone/PTCL and Telenor, including on-net/off-net limitations.
2. Dedicated or shared short-code format, provisioning lead time, PTA/operator approvals and ownership.
3. Sandbox/test MSISDN access and a non-production short code.
4. Exact inbound request content type, raw payload examples and field definitions for session ID, event/request ID, MSISDN, user input, new/continue/end state and timestamp.
5. Exact response status, content type, encoding, maximum bytes, `CON`/`END` equivalent, and response timeout.
6. Authentication: signature header, canonical bytes, algorithm, timestamp window, key ID/rotation, mTLS availability and source CIDRs.
7. Replay and retry behavior: stable event ID, retry schedule, maximum attempts, duplicate semantics and response-loss behavior.
8. Session limits: duration, idle timeout, number of screens, maximum input/output characters and Unicode/Urdu support.
9. MSISDN trust: whether the operator attests the subscriber number, how ported numbers appear, and any masking/tokenization option.
10. Availability SLA, maintenance notifications, incident escalation, rate limits and peak-session capacity.
11. Data location, retention, subprocessors, breach notification and deletion terms for Pakistani subscriber data.
12. Setup, monthly, session and cross-network charges, taxes, minimum commitments and termination/export terms.

## Required provider test artifacts

The provider must supply sanitized signed fixtures for:

- new session, continuation and terminal callbacks;
- exact retry of the same event;
- same session with a new event;
- stale and invalid signatures;
- changed payload using a reused event ID;
- unknown/ported MSISDN;
- provider timeout and application timeout;
- cancellation, subscriber hang-up and session expiry;
- maximum-length and Urdu/Unicode input/output.

Fasal Guard will convert these into contract tests before enabling the adapter. Fixtures must contain provider test numbers only and remain outside public source control if the agreement classifies them as confidential.

## Live acceptance gate

Live Pakistan USSD requires all of these results:

- provider-specific raw-body signature verification and key rotation tests;
- provider-specified bounded plain-text/JSON response and retry behavior;
- verified-phone enrollment and PIN recovery design;
- durable security events for signature, replay, event conflict and phone/session mismatch;
- PIN credential-version recheck at confirmation;
- sandbox device flow through provider → public HTTPS callback → API → PostgreSQL → authenticated ledger read;
- concurrency, outage, rollback, cancellation, expiry, amount boundaries, ownership change and privacy-log tests;
- production callback URL, TLS, WAF/rate limits, monitoring, alerting and rollback runbook;
- legal/privacy approval for subscriber and transaction metadata.

Until the gate passes, production must keep `USSD_ENABLED=false`. The existing `contract-test` adapter must never be configured as a live provider.

