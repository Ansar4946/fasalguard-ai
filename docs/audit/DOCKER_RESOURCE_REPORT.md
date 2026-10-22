> Imported historical audit. See [WORKSPACE_REVALIDATION.md](WORKSPACE_REVALIDATION.md) for current paths, verification limits, and corrections.

# Docker Resource Report — Phase B

Date 2026-10-13. Raw data: `logs/docker_resources_final.log`, `logs/ml_mem_samples.log`, `logs/phaseb_run.log`.

## 1. Host and engine

| Item | Value |
|---|---|
| Engine | Docker Desktop 29.7.2 (WSL2, kernel 6.18.40.1-microsoft-standard-WSL2), Compose v5.5.1 |
| VM resources | 4 CPUs, 5.73 GiB RAM (5,871 MiB), 2 GiB swap |
| Docker data disk | `C:\Users\Penta Squad\AppData\Local\Docker\wsl\disk` → **symlink to `D:\DockerData\disk`** |
| Host disk before Phase B | C: 14 GB free; D: 27 GB free |
| Host disk after Phase B | C: 15 GB free; D: **21 GB free** (≈ 6 GB consumed) |

## 2. Isolation

| Resource | Phase B name | Pre-existing names (untouched) | Collision |
|---|---|---|---|
| Compose project | `fasalguard-phaseb` | `fasalguard`, `n8n-local` | none |
| Volumes | `fasalguard-phaseb_{pgdata,redisdata,miniodata}` | `fasalguard_{postgres,redis,media}_data`, `n8n-local_*`, `omr-build*`, `buildx_buildkit_default_state` | none |
| Network | `fasalguard-phaseb_default` | `fasalguard_default` | none |
| Containers | `fasalguard-phaseb-<service>-1`, one-off `fasalguard-phaseb-api-run-*` (`--rm`), `fasalguard-phaseb-pywapor-fixture` (`--rm`) | `fasalguard-*-1` (7, exited) | none |
| Host ports | all bound to **127.0.0.1**: 3000, 5432, 6379, 8000, 8080, 9000, 9001 | legacy uses 0.0.0.0:4000/5432/6379/8000 (stopped) | would collide on 5432/6379/8000 **if the legacy stack were restarted** |

No `prune`, `rm`, `down -v`, `volume rm` or other destructive command was run. Legacy containers and volumes were only inspected.

## 3. Images built or pulled

| Image | Size | Build time / note |
|---|---|---|
| `fasalguard-phaseb-api` (= processor) | 2.03 GB (456 MB content) | ≈ 10 min; GDAL + deps |
| `fasalguard-phaseb-tiler` | 1.72 GB | ≈ 8 min |
| `fasalguard-phaseb-web` | 252 MB | ≈ 13 min (npm install ≈ 6.5 min, unlocked) |
| `fasalguard-phaseb-ml-processor` | **4.29 GB** | ≈ 15 min; torch 2.6.0+cpu (179 MB wheel) |
| `imresamu/postgis:16-3.4` | 893 MB | pulled |
| `cgr.dev/chainguard/minio@sha256:dc455cdd…1e56` | 236 MB | **substitute**: `minio/minio` is unpullable |
| `mcr.microsoft.com/playwright/python:v1.49.0-noble` | 3.43 GB | screenshots only |
| `mambaorg/micromamba:1.5.10` | 136 MB | pyWaPOR fixture run |

Build concurrency: one image at a time (api → tiler → web → ml-processor). Build cache is now 13.1 GB, of which 3.9 GB is reclaimable. **It was not pruned.**

## 4. Runtime usage

| Service | Steady RAM | Notes |
|---|---|---|
| db (PostGIS 16) | 63 MiB | |
| redis | 15 MiB | |
| minio (substitute) | 223 MiB | |
| api (uvicorn) | 161 MiB | |
| processor (Celery ×4) | 334 MiB | 290–334 MiB across runs |
| tiler (uvicorn ×2) | 192 MiB | |
| web (Next standalone) | 27 MiB | |
| **Total (7 services)** | **≈ 1.0 GiB** | VM "available" stayed ≥ 4.1 GiB |
| ml-processor | 0.49 GiB idle; **1.07 GiB peak**, 90% CPU during the detection run | Inference never started (checkpoint load failed), so true FTW inference peak is **not measured** |

Volume sizes after the tests: pgdata 114 MB, miniodata 126 MB (mostly the FTW checkpoint), redisdata 0.36 MB.

## 5. Stability incident

At **05:09:39Z** the Docker Desktop VM stopped answering its health pings. At 05:10:28Z Docker Desktop powered the VM off and restarted it, and every phaseb container exited with code 255 at once (`OOMKilled=false`). The trigger window began ~75 s after `schedule_weekly_index_compute` fanned out 16 index tasks (concurrency 4) while a SoilGrids fetch was running. Memory two minutes earlier showed 4.3 GiB available. **Root cause undetermined**: no OOM record, and the cause wasn't visible in the backend log (`com.docker.backend.exe.log`). Data survived (migrations at 0014, layers intact) and the stack restarted cleanly.

Recommendation: give Docker Desktop ≥ 8 GiB for Phase C. Set `--concurrency 2` and container `mem_limit` values for workers. Treat VM restarts as a risk in long ML runs.

## 6. Resource classifications

| Item | Class | Note |
|---|---|---|
| Core stack (db, redis, minio-sub, api, processor, tiler, web) | RUN_PASS | fits comfortably |
| ml-processor build and start | RUN_PASS | 4.29 GB image |
| FTW inference peak memory | NOT_TESTED | blocked by checkpoint/code incompatibility, not by resources |
| Concurrent full-stack and ML inference | NOT_TESTED | ML ran with web/tiler/processor stopped as a precaution |
| Disk headroom on D: | warning | 21 GB free; another full rebuild cycle could consume ~10 GB more |
