// Every sync request the BFM relays to the `inventory` pillar fails (SYNC is
// `down`), or goes through again (`up`), while `/openapi` keeps answering so
// the tab stays. `scripts/ios-e2e/inventory-pillar.mjs` says how.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/inventory/sync-' + SYNC, {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.syncOutage = {
  status: answered.status,
  state: json(answered.body),
};
