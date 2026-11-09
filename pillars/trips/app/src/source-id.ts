/** Parse an actual positive integer route identity without coercing fractional, exponential or unsafe values. */
export function sourceId(value: string | undefined): number | undefined {
  if (!value || !/^[1-9]\d*$/u.test(value)) return undefined;
  const id = Number(value);
  return Number.isSafeInteger(id) ? id : undefined;
}
