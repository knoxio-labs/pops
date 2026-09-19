// The `inventory` pillar starts answering its `/openapi`, so the bfm reports
// `inventory` as reachable and the app draws a tab for it.
//
// Every other flow leaves this alone and meets the root without Inventory.
// `scripts/ios-e2e/inventory-pillar.mjs` says why the switch is a gate in
// front of the real pillar rather than a registry entry that appears.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/inventory/up', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

// The pillar's database outlives a flow: the lane retries a failed flow
// against the same pillar, so what this one creates is named for this run and
// cannot be confused with what an earlier attempt left behind.
output.inventory = {
  status: answered.status,
  state: json(answered.body),
  run: String(Date.now()).slice(-6),
};
