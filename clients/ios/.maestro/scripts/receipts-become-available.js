// The `purchases` pillar starts answering its `/openapi`, so the bfm reports
// `receipt-capture` as reachable and the app draws a second tab for it.
//
// Every other flow leaves this alone and meets the single-feature root, which
// is what keeps this switch from changing what they assert.
// `scripts/ios-e2e/purchases-stub.mjs` says why the switch is a probe that
// answers rather than a registry entry that appears.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/purchases/up', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.receipts = { status: answered.status, state: json(answered.body) };
