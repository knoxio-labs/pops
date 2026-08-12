// finance's `/openapi` starts resetting the connection instead of answering,
// while `/registry/pillars` keeps reporting it registered and healthy.
// `probeContractRoute` (`pillars/bfm/src/api/mobile/reachability.ts`) reads a
// request that never completed as `unavailable`, and `AppShellModel.surface`
// then filters transactions out of what the root screen can draw — the app
// never opens the transactions screen at all.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/finance/openapi-unreachable', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.outage = { status: answered.status, state: json(answered.body) };
