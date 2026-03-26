# PRD-017 US-04: Recovery Procedure

**GH Issue:** #381
**Status:** missing

## Audit Findings

No recovery procedure found in the codebase:

- No Ansible playbook for restore operations
- No restore script template in `infra/ansible/roles/backups/`
- No recovery documentation in `infra/` or docs
- Backup script (`backup.sh.j2`) does not include a corresponding restore script

The backup mechanism (rclone to B2, age-encrypted) is in place, but there is no documented or automated recovery procedure for restoring from backup.

## Gap

A recovery runbook or restore script is needed to complete this user story.
