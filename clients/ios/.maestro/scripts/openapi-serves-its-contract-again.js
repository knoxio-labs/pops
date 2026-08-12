// finance's `/openapi` answers its real contract again. The flow taps Try
// again after this, so the root screen has to leave the contract-mismatch
// state on its own, the same proof `openapi-comes-back.js` gives for the
// unavailable state.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/finance/contract-ok', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.recovery = { status: answered.status, state: json(answered.body) };
