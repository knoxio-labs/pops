/** Compare retained canonical field values without substituting a newer source revision. */
export function sameFields(first: unknown, second: unknown): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

/** Confirm that the current affected row still contains every exact submitted field. */
export function containsFields<Row extends object>(row: Row, fields: Partial<Row>): boolean {
  return Object.keys(fields).every(
    (key) => Reflect.has(row, key) && sameFields(Reflect.get(row, key), Reflect.get(fields, key))
  );
}
