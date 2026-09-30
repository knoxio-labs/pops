import { DatabaseSync } from 'node:sqlite';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerUnicodeLowerSqliteFunction } from '../sql-functions.js';

let database: DatabaseSync;

beforeEach(() => {
  database = new DatabaseSync(':memory:');
});

afterEach(() => {
  database.close();
});

describe('registerUnicodeLowerSqliteFunction', () => {
  it('registers a deterministic SQLite function under its public name', () => {
    registerUnicodeLowerSqliteFunction(database);

    const registeredFunction = database
      .prepare('SELECT name, flags FROM pragma_function_list WHERE name = ?')
      .get('pops_unicode_lower');

    expect(registeredFunction?.name).toBe('pops_unicode_lower');
    const flags = registeredFunction?.flags;
    expect(typeof flags).toBe('number');
    if (typeof flags !== 'number') throw new Error('SQLite did not report the registered function');
    expect(flags & 0x800).toBe(0x800);
  });

  it('uses Unicode lowercase mapping and returns NULL for non-text inputs', () => {
    registerUnicodeLowerSqliteFunction(database);

    expect(database.prepare('SELECT pops_unicode_lower(?) AS value').get('CAFÉ ZÜRI')).toEqual({
      value: 'café züri',
    });
    expect(database.prepare('SELECT pops_unicode_lower(NULL) AS value').get()).toEqual({
      value: null,
    });
    expect(database.prepare('SELECT pops_unicode_lower(?) AS value').get(42)).toEqual({
      value: null,
    });
  });
});
