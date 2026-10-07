const pairing = http.post(CONTROL_BASE_URL + '/__e2e/pair', {
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    deviceId: SIMULATOR_UDID,
    pairingBaseUrl: SERVER_URL,
  }),
});

if (pairing.status !== 202 || json(pairing.body).triggerDispatched !== true) {
  throw new Error('native simulator pairing trigger was not dispatched');
}

output.pairingTrigger = { dispatched: true };
