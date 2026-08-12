// What the harness saw while the flow was driving the screen: how many bearer
// tokens it aged, how many refreshes went past it, and whether finance is
// refusing. A silent refresh leaves no mark on a screenshot, so this is the
// only evidence that the flow exercised one.
const answered = http.get(CONTROL_BASE_URL + '/__e2e/state');

output.harness = json(answered.body);
