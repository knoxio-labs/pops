# PRD-015 US-01: Set up Ansible Vault

**GH Issue:** #373
**Status:** done

## Audit Findings

Ansible Vault is fully configured:

- `infra/ansible/inventory/group_vars/pops_servers/vault.yml` — exists, AES256 encrypted (`$ANSIBLE_VAULT;1.1;AES256`)
- `infra/ansible/ansible.cfg` — `vault_password_file = ~/.ansible/pops-vault-password` configured
- `infra/ansible/inventory/group_vars/pops_servers/vars.yml` — plaintext vars referencing `vault_*` variables

All secrets are stored encrypted in vault.yml. The vault password file path is configured in ansible.cfg, not hardcoded in playbooks.
