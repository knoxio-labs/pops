// Arms the harness to swap the next `/mobile/*` request's bearer token for one
// of the same device that expired an hour ago. `scripts/ios-e2e/control-plane.mjs`
// does the swapping and says why it is done there rather than by shortening the
// pillar's TTL.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/access-token/expire-next', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.arming = { status: answered.status, state: json(answered.body) };
