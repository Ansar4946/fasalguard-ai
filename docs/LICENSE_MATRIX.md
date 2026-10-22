# Licence matrix

Status values: OK (permissive, notice only), NOTICE (attribution/LGPL obligations to satisfy),
NEEDS_LEGAL_DECISION (not decided here). Python licences below are from upstream metadata for the
exact pinned versions and were NOT machine-verified in this environment; regenerate with
`pip-licenses --with-urls --with-license-file` in each built image before release.
Node/mobile licences were read from installed `package.json` files.

## Flagged: react-leaflet 5.0.0 — NEEDS_LEGAL_DECISION

Used by the web app (`package.json`: `"react-leaflet": "^5.0.0"`). SPDX `Hippocratic-2.1`
(copy: `node_modules/react-leaflet/LICENSE.md`; part of the code is also MIT from earlier versions).
Summary of exact restrictions (not legal advice, not a decision):

1. Notice: every recipient of any part of the software must get the licence and copyright notice;
   modified versions need prominent change notices. Non-compliance not cured within 30 days of written
   notice ends the licence.
2. Human Rights Principles: licensee must use the software consistently with the UN Universal
   Declaration of Human Rights and UN Global Compact principles. Disputes are settled by arbitration
   under the Hague Rules on Business and Human Rights; the licensee may decline to arbitrate, in which
   case the licence ends immediately. Arbitration documents are public by default.
3. Human Rights Laws: the software must not be used for systems/activities that violate applicable
   human, civil, labour, privacy, political, environmental, security, economic or due-process rights
   laws; where several jurisdictions apply, the law most protective of the harmed individuals applies.
4. Indemnity: licensee indemnifies licensor/contributors (including attorney fees) for losses arising
   from use in violation of those laws or principles.
5. Enforcement: breach is also IP infringement; licensor may seek specific performance. If any human
   rights term is held unenforceable, all rights granted are null and void between licensor and
   licensee (unusual, fail-closed clause).
6. The licence is not OSI-approved and is not DFSG/SPDX-"free"; it restricts field of use, so many
   corporate policies and downstream/distributor terms reject it.

Open question for counsel: accept, replace (e.g. use Leaflet directly, BSD-2-Clause, or another
wrapper) or obtain a separate licence. Owner: legal. No code change has been made.

## Node / web / API

| Component | Licence | Status | Note |
|---|---|---|---|
| sharp 0.35.x (services/api) | Apache-2.0 | OK | |
| @img/sharp-* platform packages (bundle libvips) | Apache-2.0 AND LGPL-3.0-or-later | NOTICE | Keep LGPL text, dynamic linking, do not lock libvips; see THIRD_PARTY_NOTICES.md |
| react-leaflet 5.0.0 | Hippocratic-2.1 | NEEDS_LEGAL_DECISION | see above |

## Python (pinned versions)

| Package | Licence | Status |
|---|---|---|
| fastapi 0.143.0, pydantic 2.11, pydantic-settings, SQLAlchemy 2.0.40, redis 5.2.1, PyJWT, pytest, respx, ruff, beautifulsoup4, onnxruntime 1.22.1 | MIT | OK |
| starlette 1.8.0, uvicorn, httpx, celery 5.5.2, pandas 2.2.3, numpy, shapely, rasterio | BSD-3-Clause | OK (numpy/rasterio/shapely wheels bundle OpenBLAS, GDAL, PROJ, GEOS: GEOS is LGPL-2.1, see NOTICE) |
| psycopg2-binary 2.9.10 | LGPL-3.0 with OpenSSL exception | NOTICE (unmodified, dynamically linked; bundles libpq/OpenSSL) |
| Pillow 12.x | MIT-CMU (HPND) | OK (wheels bundle libjpeg-turbo, zlib, freetype, libtiff etc.; keep their notices) |
| structlog 25.3.0 | MIT OR Apache-2.0 | OK |
| matplotlib 3.10.3 | Matplotlib (PSF-style) licence | OK |
| requests 2.33.0 | Apache-2.0 | OK |
| pyfao56 1.4.3 | see `licenses/PYFAO56.txt` | OK (retained) |
| pyWaPOR | Apache-2.0 (`licenses/PYWAPOR.txt`) | OK (retained) |
| GDAL/PROJ (conda, Dockerfile.wapor) | MIT/X | OK |

## Mobile (mobile/, installed versions)

| Package | Version | Licence | Status |
|---|---|---|---|
| expo | 57.0.30 | MIT | OK |
| expo-crypto, -file-system, -image-manipulator, -image-picker, -notifications, -secure-store, -sqlite | 57.0.x | MIT | OK |
| react / react-native | 19.2.3 / 0.86.3 | MIT | OK |
| onnxruntime-react-native / onnxruntime-common | 1.24.3 | MIT | OK (bundled native ONNX Runtime is MIT) |
| @noble/ciphers | 2.4.0 | MIT | OK |
| jpeg-js | 0.4.4 | BSD-3-Clause | NOTICE (reproduce notice in app) |
| patch-package (dev only) | 8.0.1 | MIT | not shipped |

Transitive native/Android libraries from React Native/Expo (Hermes, Fresco, OkHttp, etc.) need an
aggregated notice generated at release time; not yet done. Model weights/data licensing for F06 is
tracked separately in docs/features/F06.md.
