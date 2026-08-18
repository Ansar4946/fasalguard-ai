# Mock and dummy data report

## Production-reachable issues

| Location | Classification | Impact | Planned removal stage |
|---|---|---|---|
| `features/farms/data.ts` | PRODUCTION BUG | Static farm list/detail | Farms integration |
| `features/intelligence/data.ts` | PRODUCTION BUG | Fake satellite/weather values | Satellite and weather integration |
| `features/diagnosis/mock-repository.ts` | PRODUCTION BUG | Simulated diagnosis | Crop diagnosis integration |
| `features/expert/data.ts` | PRODUCTION BUG | Static cases and metrics | Expert/incident integration |
| `features/governance/data.ts` | PRODUCTION BUG | Static government analytics | Analytics integration |
| `features/conversations/data.ts` | PRODUCTION BUG | Static consultation messages | Consultation integration |
| `features/learning/data.ts` | REVIEW REQUIRED | Static content may be legitimate curated content but needs expert approval provenance | Knowledge integration |
| onboarding provider local storage | TEMPORARY DRAFT STATE | Not registered backend identity/farm data | Registration integration |
| dashboard components | PRODUCTION BUG | Placeholder metrics, alerts and charts | Dashboard integration |

## Allowed mocks

Backend fake providers and test fixtures are permitted only in development/test configuration. They must never be represented as live provider output or business evidence. Unit-test values are not production metrics.

The simulated login redirect was removed. OTP no longer bypasses authentication and remains disabled until a production provider is configured.
