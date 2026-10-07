const pairing = http.post(CONTROL_BASE_URL + '/__e2e/pair/status', {
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ deviceId: SIMULATOR_UDID }),
});

if (pairing.status !== 200 || json(pairing.body).paired !== true) {
  throw new Error('native simulator pairing did not store a session');
}

output.pairing = { paired: true };
