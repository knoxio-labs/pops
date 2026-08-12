// Revokes the paired device the way an operator does: the BFM's own
// `GET /operator/devices` and `DELETE /operator/devices/:id`, which is what the
// Devices page calls. Nothing here touches the database directly — a SQL write
// would skip the route the operator actually uses, and that route is half of
// what this flow is about.
//
// The device is found rather than named, because pairing minted its id inside
// the app a few seconds ago and nothing outside the BFM knows it. Exactly one
// device is expected: every flow starts from `clearState` + `clearKeychain`
// against a database this run created.
const listed = json(http.get(CONTROL_BASE_URL + '/operator/devices').body);
const devices = Array.isArray(listed.devices) ? listed.devices : [];
const live = devices.filter((device) => !device.revokedAt);

output.revocation = { listed: live.length, status: 0, alreadyRevoked: null };

if (live.length === 1) {
  const answered = http.request(CONTROL_BASE_URL + '/operator/devices/' + live[0].id, {
    method: 'DELETE',
  });
  output.revocation.status = answered.status;
  output.revocation.alreadyRevoked = json(answered.body).alreadyRevoked;
}
