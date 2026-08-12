// Revokes the paired device the way an operator does: the BFM's own
// `GET /operator/devices` and `DELETE /operator/devices/:id`, which is what the
// Devices page calls. Nothing here touches the database directly — a SQL write
// would skip the route the operator actually uses, and that route is half of
// what this flow is about.
//
// WHICH device is not obvious and must not be guessed. Every flow in this
// directory pairs from scratch, against one database the harness created for
// the whole run, so by the time this one gets there the operator's list holds
// several perfectly live handsets and "the only one" is wrong. The control
// plane names it instead: `lastDeviceId` is read off the bearer token of the
// most recent authenticated request, which is this phone, a second ago.
const state = json(http.get(CONTROL_BASE_URL + '/__e2e/state').body);
const listed = json(http.get(CONTROL_BASE_URL + '/operator/devices').body);
const devices = Array.isArray(listed.devices) ? listed.devices : [];
const paired = devices.filter((device) => device.id === state.lastDeviceId);

output.revocation = {
  deviceId: state.lastDeviceId,
  // The operator can see it, and sees it as trusted. Both are asserted by the
  // flow: revoking something already revoked would make every screen assertion
  // below pass for a reason nobody is worried about.
  matched: paired.length,
  wasLive: paired.length === 1 && !paired[0].revokedAt,
  status: 0,
  alreadyRevoked: null,
};

if (output.revocation.wasLive) {
  const answered = http.request(CONTROL_BASE_URL + '/operator/devices/' + state.lastDeviceId, {
    method: 'DELETE',
  });
  output.revocation.status = answered.status;
  output.revocation.alreadyRevoked = json(answered.body).alreadyRevoked;
}
