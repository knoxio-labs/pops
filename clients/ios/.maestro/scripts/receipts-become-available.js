// The `purchases` pillar starts answering its `/openapi`, so the bfm reports
// `receipt-capture` as reachable and Purchases' own capture presenter (Scan,
// hand entry) becomes available inside its existing tab.
//
// Every other flow leaves this alone, which is what keeps this switch from
// changing what they assert. `scripts/ios-e2e/purchases-stub.mjs` says why
// the switch is a probe that answers rather than a registry entry that
// appears.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/purchases/up', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.receipts = { status: answered.status, state: json(answered.body) };
