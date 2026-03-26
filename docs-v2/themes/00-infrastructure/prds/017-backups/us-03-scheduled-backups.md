# PRD-017 US-03: Scheduled Backups

**GH Issue:** #380
**Status:** done

## Audit Findings

`infra/ansible/roles/backups/tasks/main.yml` creates a systemd timer for scheduled backups:

**Service** (`/etc/systemd/system/pops-backup.service`):
- Type: oneshot
- ExecStart: `/opt/pops/backup.sh`
- TimeoutStartSec: 1800 (30 minutes)

**Timer** (`/etc/systemd/system/pops-backup.timer` via `backup.timer.j2`):
- `OnCalendar={{ backup_schedule }}` (configurable via Ansible vars)
- `Persistent=true` — runs missed backups after downtime

Both service and timer are enabled via systemd. Schedule is configurable (daily by default via `backup_schedule` variable).
