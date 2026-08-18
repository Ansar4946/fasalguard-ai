# Frontend/backend integration tracker

| Feature | Frontend | Backend | Database | Auth | Real Data | Tests | Status |
|---|---|---|---|---|---|---|---|
| Login | Connected | Existing | Sessions/users | HttpOnly BFF | Yes | Backend integration + build | COMPLETE |
| Current user | Connected | Existing | Users/sessions | Refresh rotation | Yes | Backend integration + build | COMPLETE |
| Session persistence | Connected | Existing | Auth sessions | Access/refresh cookies | Yes | Backend integration + manual flow | COMPLETE |
| Logout | Connected | Existing | Session revoked | Cookies cleared | Yes | Backend integration + build | COMPLETE |
| Protected routes | Proxy gate | Existing | Active session lookup | Role-aware | Yes | RBAC integration + build | COMPLETE |
| Dashboard | Mock | Available sources | Available | Protected | No | Existing UI only | NOT STARTED |
| Farm List | Mock | Complete | Farms | Ownership | No | Backend tests | NOT STARTED |
| Farm Detail | Mock | Complete | Farm/field/twin | Ownership | No | Backend tests | NOT STARTED |
| Digital Twin | None | Complete | Temporal evidence | Ownership | No | Backend tests | NOT STARTED |
| Satellite | Mock | Complete | Captures/statistics | Ownership | No | Backend tests | NOT STARTED |
| Weather | Mock | Complete | Snapshot/forecast | Ownership | No | Backend tests | NOT STARTED |
| Crop Diagnosis | Mock | Complete | Scan/prediction | Ownership | No | Backend tests | NOT STARTED |
| Gemini Analysis | None | Complete | Run/evidence/tools | Ownership | No | Backend tests | NOT STARTED |
| Incidents | Mock | Partial read contract | Incidents | Ownership | No | Domain tests | BLOCKED |
| Actions | Mock | Complete | Tasks/tool calls | Ownership | No | Backend tests | NOT STARTED |
| Notifications | Mock | Complete | Notifications | Ownership | No | Backend tests | NOT STARTED |
| Profile | Placeholder | Partial | User/preferences | Authenticated | Partial | Backend auth tests | NOT STARTED |
