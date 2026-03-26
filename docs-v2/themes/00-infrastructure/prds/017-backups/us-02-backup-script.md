# PRD-017 US-02: Backup Script

**GH Issue:** #379
**Status:** done

## Audit Findings

`infra/ansible/roles/backups/templates/backup.sh.j2` implements a complete backup script:

1. **SQLite online backup** — `sqlite3 backup` command (safe with WAL mode)
2. **Tar archive** — bundles SQLite backup + paperless data + metabase data
3. **Age encryption** — encrypts with passphrase (from Docker secret or vault)
4. **rclone upload** — copies `.age` archive to B2 remote
5. **Cleanup** — removes local temp files after upload

Script uses `set -euo pipefail`. Deployed to `/opt/pops/backup.sh` (mode 0700, root-owned). Timestamp in filename: `pops-YYYYMMDD-HHMMSS.tar.age`.
