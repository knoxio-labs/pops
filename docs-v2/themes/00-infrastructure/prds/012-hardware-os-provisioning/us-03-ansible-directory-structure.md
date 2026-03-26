# PRD-012 US-03: Ansible Directory Structure

**GH Issue:** #366
**Status:** done

## Audit Findings

`infra/ansible/` follows standard Ansible conventions:

```
infra/ansible/
├── ansible.cfg              # inventory path, vault_password_file, host_key_checking=False
├── inventory/
│   ├── hosts.yml            # host inventory
│   └── group_vars/
│       └── pops_servers/
│           ├── vars.yml     # plaintext vars
│           └── vault.yml    # AES256 encrypted secrets
├── playbooks/
│   ├── site.yml             # full provision
│   ├── deploy.yml           # deploy only
│   └── bootstrap.yml
└── roles/
    ├── common/              # OS hardening
    ├── docker/              # Docker install
    ├── cloudflare-tunnel/   # Cloudflare setup
    ├── backups/             # rclone B2 backups
    ├── monitoring/          # health checks
    ├── pops-deploy/         # app deployment
    └── secrets/             # secrets management
```

roles_path configured in ansible.cfg. All playbooks use `become: sudo`.
