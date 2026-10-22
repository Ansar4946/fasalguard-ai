# D: project synchronization

Date:2026-10-13. Target: `D:\Fasal Guard Development Workspace\fasalguard-ai`. Source: tested `f02-work` snapshot and scoped F02 implementation also published to C:.

Copied F02 science/provider/raster/repository/router/tasks, Next UI/BFF/private content routes, corrected legacy index scripts, outbox migration, notices, Docker wiring and tests. Added required FastAPI support files because the D: checkout lacked the service. No credentials, generated private fixtures/media, caches or node_modules were copied. Private fixture/media names are ignored by Git/Docker.

Adaptations for this older checkout: extend its existing migration registry only with F02 (no unrelated SMS migration); extend its own server-session helper with optional platform routing, preserving existing core defaults; retain its existing notification tests and crop web flow. Existing 51 staged dashboard/F01/etc files remain unchanged in the index. No Git branch switch, reset, commit, staging operation or runtime deployment occurred. Existing overwritten F02 files/shared helpers were backed up under `D:\Fasal Guard Development Workspace\f02-workspace-backup`.

Actual checks against D: source:

- Web `tsc --noEmit`:exit0.
- API `tsc --noEmit`:passed before the targeted Jest run; no diagnostics.
- Satellite web scoped ESLint:exit0.
- Synced platform `ruff check app tests`:exit0.
- Synced platform `pytest -q --tb=short`:87passed,7integration deselected,64dependency warnings,76.83s,exit0.
- API four targeted Jest suites:21passed,160.939s,exit0; spectral indices, existing Sentinel provider/storage and automatic monitoring.
- `git diff --check`:exit0.

Earlier real imagery/browser/integration/build evidence belongs to the isolated implementation described in F02.md; no new D: database migration, deployment or browser stack was run for this synchronization. The separate shared helper and older migration registry were statically checked in this checkout. `SATELLITE_PLATFORM_ENABLED` remainsfalse by default. Review Compose project name/host ports before launching alongside the existing C: stack.
