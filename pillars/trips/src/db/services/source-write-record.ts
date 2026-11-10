/** Coalesce one operation's repeated writes into its original precondition and final owned row. */
export function recordSourceWrite<T extends { id: number }>(
  receipt: T[],
  inverse: { after: T; before: T | null }[],
  after: T,
  before: T | null
): void {
  const previous = inverse.find((entry) => entry.after.id === after.id);
  if (previous === undefined) inverse.push({ after, before });
  else previous.after = after;
  const index = receipt.findIndex((entry) => entry.id === after.id);
  if (index === -1) receipt.push(after);
  else receipt[index] = after;
}
