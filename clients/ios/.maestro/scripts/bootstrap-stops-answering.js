// Keep bootstrap unavailable across foreground-triggered refreshes until the
// flow restores it, so the degraded phase remains visible beside the list error.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/bootstrap/down', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.armed = { status: answered.status, state: json(answered.body) };
