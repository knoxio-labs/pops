/** Compares inventory records by name, using ids to make equal names stable. */
export function compareInventoryNames(
  left: Readonly<{ name: string; id?: string }>,
  right: Readonly<{ name: string; id?: string }>
): number {
  const byName = left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
  if (byName !== 0) return byName;
  if (left.id === undefined || right.id === undefined) return 0;
  return left.id.localeCompare(right.id);
}
