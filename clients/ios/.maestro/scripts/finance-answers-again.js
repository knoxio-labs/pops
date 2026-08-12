// finance serves its data routes again. The flow taps Retry after this, so the
// screen has to leave the failure state on its own — which is what proves the
// sentence above it was a state and not a dead end.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/finance/up', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.recovery = { status: answered.status, state: json(answered.body) };
