const answered = http.post(CONTROL_BASE_URL + '/__e2e/bootstrap/up', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.recovery = { status: answered.status, state: json(answered.body) };
