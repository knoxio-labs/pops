// Publishes `Phone gadget` — a user-defined type with a stored `Price` and a
// computed `Doubled price` — on the real inventory pillar, at catalogue
// minimum protocol 2. `scripts/ios-e2e/inventory-user-type.mjs` does the
// publishing and says why it is idempotent.
const answered = http.post(CONTROL_BASE_URL + '/__e2e/inventory/user-defined-type', {
  headers: { 'content-type': 'application/json' },
  body: '{}',
});

output.userDefinedType = {
  status: answered.status,
  state: json(answered.body),
};
