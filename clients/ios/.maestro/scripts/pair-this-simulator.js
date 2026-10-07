const pairing = http.post(CONTROL_BASE_URL + '/__e2e/pair', {
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    deviceId: SIMULATOR_UDID,
    pairingBaseUrl: SERVER_URL,
  }),
});

if (pairing.status !== 200) throw new Error('native simulator pairing failed');

output.pairing = { delivered: true };
