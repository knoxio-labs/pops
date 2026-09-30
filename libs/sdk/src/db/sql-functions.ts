/** The SQLite connection surface required to register a scalar function. */
export interface SqliteFunctionRegistrar {
  function(
    name: string,
    options: { deterministic: true },
    implementation: (value: unknown) => string | null
  ): unknown;
}

/**
 * Register `pops_unicode_lower(value)` on a SQLite connection. Its result
 * matches JavaScript `String.prototype.toLowerCase()` for text and preserves
 * SQL NULL behavior, so SQL search predicates and TypeScript ranking agree
 * for non-ASCII case variants.
 */
export function registerUnicodeLowerSqliteFunction(database: SqliteFunctionRegistrar): void {
  database.function('pops_unicode_lower', { deterministic: true }, (value) =>
    typeof value === 'string' ? value.toLowerCase() : null
  );
}
