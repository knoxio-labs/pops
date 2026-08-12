// finance's `/openapi` answers its real contract again. The flow taps Try
// again after this, so the root screen has to leave the unavailable state on
// its own — which is what proves the sentence above it was reporting a
// condition rather than describing a corner the app cannot leave.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/finance/openapi-reachable', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.recovery = { status: answered.status, state: json(answered.body) };
