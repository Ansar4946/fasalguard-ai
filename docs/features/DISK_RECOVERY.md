# Disk recovery and F07 validation —14 October2026

| Drive | Initial free space | Final measured free space |
|---|---:|---:|
| C: |5.07GB|10.19GB|
| D: |0.60GB|16.97GB|

Removed regenerable npm/pip download caches, unlocked Flutter test compilation folders, failed FasalGuard Next.js build output and selected build-only Next.js caches. Successful production server/static artifacts and installed locked dependencies retained. Projects, all51 originally staged paths, backups, personal files, model weights and Docker volumes preserved. Recursive cleanup targets were resolved and checked against intended roots; reparse points/in-use cache files were refused.

Docker's active virtual disk is reached through the existing local Docker junction at D:\DockerData\disk. The separate D:\DockerDesktopWSL\disk\docker_data.vhdx was verified detached and exclusively readable. The user approved the administrator request. Reviewed DiskPart commands selected only that disk, displayed its details and compacted it; no delete/format/attach/detach commands used. Exit0;35.17→19.09GB, reclaiming16.08GB while retaining contents. This follows [Microsoft's compact-vdisk documentation](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/compact-vdisk). Active Docker disk not compacted or removed.

User separately approved restarting unresponsive Docker Desktop. After recovery, existing application containers were healthy and isolated test PostgreSQL/Redis were started for F07. No docker compose down-v, system prune, image/volume reset or production database operation performed.

Existing package manifest/lock declared Next16.4.0 but installed copy was16.2.12. npm ci restored16.4.0 without changing versions. Production web build,48 feature tests and genuine-data authenticated browser/database workflow passed; see [F07 evidence](F07.md). Free space varies with later builds, downloads and Docker writes.

The earlier immediate post-compaction C: measurement was11.20GB; subsequent validation/temporary system writes left10.19GB at the final check. D: remained16.97GB.
