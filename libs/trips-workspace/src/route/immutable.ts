/** Detach and freeze route JSON so exposed nested aliases cannot rewrite a retained request or receipt. */
export function ownRouteValue<T>(value: T): T {
  return freeze(structuredClone(value));
}
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
}
