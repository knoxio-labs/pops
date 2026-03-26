# PRD-017 US-01: Set up rclone with Backblaze B2

**GH Issue:** #378
**Status:** done

## Audit Findings

`infra/ansible/roles/backups/tasks/main.yml` installs and configures rclone:

- Installs `rclone` via apt
- Installs `age` encryption tool
- Creates backup directory with 0700 permissions
- Backup script (`backup.sh.j2`) uses `rclone copy "${ARCHIVE}.age" "{{ rclone_remote_name }}:pops-backups/" --progress` to upload to B2

The rclone remote is configured via `{{ rclone_remote_name }}` variable (from Ansible vars). Age encryption applied before upload — archives are encrypted with a passphrase before leaving the host.
