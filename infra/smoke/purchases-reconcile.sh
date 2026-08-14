#!/usr/bin/env bash
#
# Two-process reconciliation smoke test.
#
# Everything else that covers this seam runs in one process: the solver is
# pure, the sweep uses an injected client, and even the real-HTTP test
# (pillars/purchases/src/api/finance/__tests__/finance-http.test.ts) serves
# a fake finance from the same Node process as the client calling it.
#
# None of that exercises what actually breaks in a deployment — whether
# purchases-api can find finance-api through the registry, over the Docker
# network, with the compose environment as configured. This does.
#
# It is deliberately a script rather than a Vitest test: it needs images
# built and containers up, which is minutes rather than milliseconds, and a
# suite that slow stops being run.
#
#   POPS_INTERNAL_API_KEY=<key> ./infra/smoke/purchases-reconcile.sh
#
# The key is a service account minted in the registry, and it is required:
# purchases holds a caller presenting one to that account's grant (ADR-044),
# so the account this runs as needs `purchases.source` and
# `purchases.purchase` or the ingest below is a 403. Running without a key
# would be admitted — purchases still serves an anonymous caller — which is
# exactly the hole this script must not sit in.
#
# That key is this script's own inbound credential and is separate from the
# one purchases-api itself sends outbound: the compose service mounts
# `secrets/pops_purchases_api_key` for that (provisioning:
# infra/secrets.example/purchases/README.md). Compose refuses to start a
# service whose secret file is absent, so the `up` below is where a host that
# has never provisioned it finds out.
#
# Exit 0 = purchases reconciled a real order against a real finance
# transaction across the network. Exit 1 = it did not, with the reason.

set -euo pipefail

COMPOSE_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docker-compose.yml"
SERVICES=(registry-api finance-api purchases-api)
KEEP_UP="${KEEP_UP:-0}"
# Trimmed before it is checked, so a key that is only whitespace fails the
# guard below rather than being sent as one — matching what the ingest CLI
# does, and keeping "refuses to start without one" true for both callers.
API_KEY="$(printf '%s' "${POPS_INTERNAL_API_KEY:-}" | tr -d '[:space:]')"

# Unique per run so a re-run is not a 409 against the previous run's data.
STAMP="$(date +%s)"
ORDER_ID="smoke-${STAMP}"
AMOUNT_DOLLARS="41.28"
AMOUNT_CENTS=4128
ORDER_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
TXN_DATE="$(date -u +%Y-%m-%d)"

log() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

if [[ -z "$API_KEY" ]]; then
  fail "set POPS_INTERNAL_API_KEY to a service-account key granted purchases.source and purchases.purchase"
fi

cleanup() {
  if [[ "$KEEP_UP" == "1" ]]; then
    log "KEEP_UP=1 — leaving containers running"
    return
  fi
  log "Tearing down"
  docker compose -f "$COMPOSE_FILE" stop "${SERVICES[@]}" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Run a command inside the purchases container. Every call below goes
# through the Docker network rather than a published port, because the
# network is part of what is under test.
#
# The key travels as an environment variable rather than interpolated into
# the `node -e` source below, so it does not land in the container's process
# arguments.
in_purchases() {
  docker compose -f "$COMPOSE_FILE" exec -T \
    -e "POPS_INTERNAL_API_KEY=$API_KEY" purchases-api "$@"
}

wait_for_health() {
  local service="$1" url="$2" attempts=60
  for ((i = 1; i <= attempts; i++)); do
    if docker compose -f "$COMPOSE_FILE" exec -T "$service" \
      node -e "fetch('$url').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" \
      >/dev/null 2>&1; then
      return 0
    fi
    sleep 2
  done
  fail "$service never became healthy at $url"
}

# Short cadence so the sweep ticks within the test's patience.
export PURCHASES_SWEEP_COALESCE_MS=2000
export PURCHASES_SWEEP_POLL_MS=5000

log "Building and starting ${SERVICES[*]}"
docker compose -f "$COMPOSE_FILE" up -d --build "${SERVICES[@]}"

log "Waiting for health"
wait_for_health registry-api http://localhost:3001/health
wait_for_health finance-api http://localhost:3004/health
wait_for_health purchases-api http://localhost:3013/health

log "Confirming purchases can see finance through the registry"
in_purchases node -e "
  fetch('http://registry-api:3001/registry/pillars')
    .then((r) => r.json())
    .then((body) => {
      const ids = (body.pillars ?? []).map((p) => p.pillarId);
      if (!ids.includes('finance')) {
        console.error('registry does not list finance; saw:', ids.join(', ') || '(none)');
        process.exit(1);
      }
      console.log('registry lists:', ids.join(', '));
    })
    .catch((e) => { console.error(String(e)); process.exit(1); });
" || fail "purchases-api cannot resolve finance through the registry"

log "Seeding a finance transaction of \$${AMOUNT_DOLLARS}"
in_purchases node -e "
  fetch('http://finance-api:3004/transactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      description: 'AMAZON MKTPLACE AU SMOKE',
      account: 'smoke',
      amount: ${AMOUNT_DOLLARS},
      date: '${TXN_DATE}',
      type: 'purchase',
      tags: [],
    }),
  })
    .then(async (r) => {
      if (!r.ok) { console.error('finance rejected the seed:', r.status, await r.text()); process.exit(1); }
      console.log('seeded transaction');
    })
    .catch((e) => { console.error(String(e)); process.exit(1); });
" || fail "could not seed a finance transaction"

log "Registering the smoke source and ingesting an order"
# Only the purchases calls carry the key. The finance seed above stays
# uncredentialled because this account is granted purchases scopes, and a key
# presented to finance is held to a grant it does not have.
in_purchases node -e "
  const base = 'http://localhost:3013';
  // Header name is literal by necessity (inline shell script, no import). The
  // canonical spelling lives in SERVICE_ACCOUNT_HEADER, libs/sdk/src/server/service-account-auth.ts.
  const headers = {
    'content-type': 'application/json',
    'x-api-key': process.env.POPS_INTERNAL_API_KEY,
  };
  const put = fetch(base + '/sources/smoke', {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      label: 'Smoke',
      descriptorPattern: 'AMAZON%',
      settlementWindowDays: 21,
      autoLinkPolicy: 'review',
    }),
  });
  put
    .then(async (r) => {
      if (!r.ok) throw new Error('source upsert failed: ' + r.status + ' ' + (await r.text()));
      return fetch(base + '/purchases', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          source: 'smoke',
          sourceOrderId: '${ORDER_ID}',
          ingestMethod: 'manual',
          orderedAt: '${ORDER_DATE}',
          currency: 'AUD',
          totalCents: ${AMOUNT_CENTS},
          checksum: '${ORDER_ID}',
        }),
      });
    })
    .then(async (r) => {
      if (r.status !== 201) throw new Error('ingest failed: ' + r.status + ' ' + (await r.text()));
      const body = await r.json();
      console.log('ingested', body.purchase.id);
    })
    .catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
" || fail "could not ingest the smoke order"

log "Waiting for the sweep to reconcile it"
# The cadence was lowered to seconds above, so the ingest trigger and the
# poll both fire well inside this window. What is being tested is the
# network path, not the timer.
in_purchases node -e "
  const base = 'http://localhost:3013';
  const headers = { 'x-api-key': process.env.POPS_INTERNAL_API_KEY };
  const deadline = Date.now() + 120000;

  async function poll() {
    const list = await (await fetch(base + '/purchases?limit=500', { headers })).json();
    const found = (list.items ?? []).find((p) => p.sourceOrderId === '${ORDER_ID}');
    if (!found) throw new Error('the ingested order is not listed');
    const detail = await (await fetch(base + '/purchases/' + found.id, { headers })).json();
    return detail;
  }

  (async () => {
    while (Date.now() < deadline) {
      const detail = await poll();
      const a = detail.accounting;
      if (a.matchedCents === ${AMOUNT_CENTS}) {
        console.log('matched:', JSON.stringify(a));
        process.exit(0);
      }
      if (a.awaitingImportCents === ${AMOUNT_CENTS}) {
        // A derived charge exists but no link yet — the sweep has run at
        // least once and is waiting on the next tick.
        console.log('awaiting link:', JSON.stringify(a));
      }
      await new Promise((r) => setTimeout(r, 5000));
    }
    const detail = await poll();
    console.error('never reconciled; final accounting:', JSON.stringify(detail.accounting));
    process.exit(1);
  })().catch((e) => { console.error(String(e.message ?? e)); process.exit(1); });
" || fail "the order was never reconciled across the two processes"

printf '\n\033[32m✓ purchases reconciled a real order against finance across the network\033[0m\n'
