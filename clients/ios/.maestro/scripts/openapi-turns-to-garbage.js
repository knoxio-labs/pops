// finance's `/openapi` starts answering 200 with a body that is not JSON —
// the misrouted-proxy case `probeContractRoute`'s own doc comment names
// (`pillars/bfm/src/api/mobile/reachability.ts`). `/registry/pillars` keeps
// reporting finance registered and healthy throughout: the request completes,
// it just cannot be read as a contract, which is what tells `contract-mismatch`
// apart from `unavailable` and must read as a different sentence on the root
// screen.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/finance/contract-mismatch', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.mismatch = { status: answered.status, state: json(answered.body) };
