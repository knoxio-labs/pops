# Trips outbound credential

Trips reads shared tag identities and verifies new or changed Contact selections
with its own registry service account. Provision
one account per environment with this exact request body:

```json
{ "name": "trips", "scopes": ["tags.tags", "contacts.entities.reference"] }
```

Send it to `POST /registry-api/service-accounts` through the deployed shell as an
operator authenticated by Cloudflare Access. This is a user-only operation;
service-account credentials cannot create other accounts. See the registry
identity and rotation procedure in [BFM provisioning](../../../pillars/bfm/README.md#provisioning-the-service-account).

The response exposes `plaintextKey` once. Capture it directly into the deployer's
secret manager and provision the repo-root `secrets/pops_trips_api_key` file with
owner-only permissions. Do not print the response, paste the key into a command,
commit it, or reuse another consumer's account. This directory intentionally
contains only instructions, with no credential template to mistake for a live key.

Both compose variants resolve `file: ../secrets/pops_trips_api_key` from `infra/`,
mount it into `trips-api` at `/run/secrets/pops_trips_api_key`, and set
`POPS_INTERNAL_API_KEY_FILE` to that path. The UI receives no credential. A newline
is trimmed by the runtime; an explicitly configured missing or unreadable file
prevents API startup.

Provision the host file before starting either compose stack. Deployment of this
repository does not create the registry account or the host secret. The deployer
must also run registered Tags and Contacts pillars reachable by Trips; the grant
alone does not supply those services. Host provisioning belongs in the deployer's infra repo.

Verify an unknown explicit tag selection can resolve a valid Tags identity and
that independent trip metadata edits remain usable if Tags is unavailable.
Verify a new responsibility Contact selection resolves its canonical identity;
retained references, self and clear remain usable if Contacts is unavailable.
Rotate by creating a replacement account with the same scope, replacing the host
file, restarting Trips and verifying tag and Contact resolution before revoking the old
account with `POST /registry-api/service-accounts/:id/revoke`.
