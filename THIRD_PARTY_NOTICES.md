# Third-party notices

## OpenFarm — F04 weather forecasting

Reference: local `banokabal/OpenFarm`, commit `884a61567dd0d149214090baf9edebc533a2a0df`.
Copyright (c) 2026, OpenFarm Contributors. BSD-3-Clause.
Full license and disclaimer: `services/platform-api/OPENFARM-LICENSE.txt` (also copied into the production Python image).

F04 adapts the daily weather variable selection and field-level provider request pattern from
`services/api/app/routers/weather.py` and `app/tasks/weather.py`. New implementation uses Fasal Guard
identities, hourly forecasts, explicit units/timestamps, validation, persistence, caching, freshness
and error handling. OpenFarm's silent empty-list fallback, organization schema and agricultural
indices are not imported. Contributor names do not imply endorsement.

## Weather data

Open-Meteo weather data: CC BY 4.0, attribution displayed in the weather UI and provider metadata.
https://open-meteo.com/ — https://creativecommons.org/licenses/by/4.0/
Commercial API access requires suitable provider subscription credentials; data attribution does
not grant free commercial API access. Forecasts are model estimates, not measurements at the field.

## Existing scientific dependencies

pyfao56 and pyWaPOR notices/licenses are retained in `licenses/` and
`services/platform-api/*LICENSE.txt`; their F03 integration is separate from F04.

## OpenFarm — F05 farm maps and boundaries

Reference revision `884a61567dd0d149214090baf9edebc533a2a0df`, BSD-3-Clause,
Copyright (c) 2026 OpenFarm Contributors. The field-scoped GeoJSON import/export patterns in
`services/api/app/routers/fields.py` informed this integration. Fasal Guard supplies its own
shared identities, bounded Polygon validation, PostGIS transactions, permissions, versions,
GPS provenance and existing Leaflet UI. The organization/MultiPolygon schema is not imported.
Full license/disclaimer: `services/platform-api/OPENFARM-LICENSE.txt` and
`services/api/OPENFARM-LICENSE.txt`. No contributor endorsement is implied.

## F06 native dependencies

No Botanix inference code or model assets are redistributed. Mobile runtime dependencies retain
their upstream licenses; @noble/ciphers2.4.0 is MIT (Paul Miller and contributors), ONNX Runtime
is MIT, and Expo/React/React Native/jpeg-js carry their respective package license notices.
The native release is blocked pending final bundled third-party notice packaging, dependency
remediation and genuine model/data licensing. See docs/features/F06.md.

## Image processing: sharp and libvips (LGPL notice)

`services/api` uses `sharp` (Apache-2.0). Its prebuilt platform packages (`@img/sharp-*`) bundle
`libvips` and dependent libraries, so those packages are licensed `Apache-2.0 AND LGPL-3.0-or-later`
(verified in `@img/sharp-win32-x64` 0.35.x; linux builds use `@img/sharp-libvips-*`, LGPL-3.0-or-later).
libvips is dynamically loaded as a shared library inside the platform package and is not modified by
Fasal Guard. Obligations when shipping the API image: keep the LGPL text and sharp/libvips notices
(`node_modules/@img/*/LICENSE`, `THIRD-PARTY-NOTICES`) in the image, do not statically link or
modify libvips without releasing the modifications, and do not prevent users from replacing the
library (do not strip or lock the `@img/sharp-libvips-*` package). Source: https://github.com/lovell/sharp
and https://github.com/libvips/libvips. Legal sign-off on distribution: pending.

## Frontend: react-leaflet (Hippocratic-2.1) — NEEDS_LEGAL_DECISION

`react-leaflet` 5.0.0 (web app) declares `Hippocratic-2.1`, an Ethical Source licence that is NOT
OSI-approved and is not a permissive licence. No decision has been taken on acceptability; see
`docs/LICENSE_MATRIX.md` for the restrictions summary. Do not treat this dependency as cleared.

## Python dependencies (platform-api, geospatial-ai, WaPOR image)

Pinned in `services/platform-api/requirements*.txt` and `services/geospatial-ai/requirements.txt`.
Licences are listed per package in `docs/LICENSE_MATRIX.md`. Notable copyleft-adjacent items:
`psycopg2-binary` (LGPL-3.0 with OpenSSL exception) and the GEOS/GDAL/PROJ libraries bundled in
`shapely`/`rasterio` wheels (GEOS is LGPL-2.1). These are used unmodified as dynamically linked
libraries. Full texts must ship in the images (`pip-licenses --with-license-file`).

## Mobile app (mobile/)

Runtime dependencies: expo, expo-crypto, expo-file-system, expo-image-manipulator,
expo-image-picker, expo-notifications, expo-secure-store, expo-sqlite, react, react-native,
onnxruntime-react-native (MIT, bundles ONNX Runtime native binaries, MIT), @noble/ciphers (MIT) and
jpeg-js (BSD-3-Clause, copyright Eugene Ware / Adobe; BSD notice must be reproduced). The Android
release must bundle an aggregated notice screen/file generated from the production dependency
tree, including transitive native libraries from the React Native and Expo toolchains. Dev tooling
(eslint, typescript, patch-package, Metro/Expo CLI) is not shipped. The `mobile/patches/` file is a
build-script fix for onnxruntime-react-native (MIT) and carries that package's licence.
