// The purchases pillar's `/search` route refuses while `/openapi` keeps
// answering and the tab stays — `scripts/ios-e2e/purchases-stub.mjs` says why
// this switch is independent of the reachability one `receipts-become-
// available.js` throws.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/purchases/search-' + SEARCH, {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.searchOutage = { status: answered.status, state: json(answered.body) };
