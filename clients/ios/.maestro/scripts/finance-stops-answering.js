// finance starts refusing its data routes, while still serving the registry and
// its own `/openapi`. That precise combination is what the transactions screen
// needs to be reachable AND unable to load — `scripts/ios-e2e/upstream-stub.mjs`
// explains why taking the whole stub down instead puts a different screen in
// front of the assertion.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/finance/down', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.outage = { status: answered.status, state: json(answered.body) };
