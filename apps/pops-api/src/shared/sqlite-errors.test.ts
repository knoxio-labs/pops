import BetterSqlite3 from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

import { isForeignKeyConstraintError, isUniqueConstraintError } from './sqlite-errors.js';

// These helpers gate user-facing error mapping, so cover them against the real
// better-sqlite3 surface — mocking the error shape would defeat the point.
function freshDb(): BetterSqlite3.Database {
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE parent (id TEXT PRIMARY KEY);
    CREATE TABLE child (
      id TEXT PRIMARY KEY,
      parent_id TEXT NOT NULL REFERENCES parent(id) ON DELETE CASCADE,
      tag TEXT NOT NULL UNIQUE
    );
  `);
  return db;
}

describe('isUniqueConstraintError', () => {
  it('returns true for a real UNIQUE constraint violation', () => {
    const db = freshDb();
    db.exec(`INSERT INTO parent (id) VALUES ('p1')`);
    db.exec(`INSERT INTO child (id, parent_id, tag) VALUES ('c1', 'p1', 'unique-tag')`);

    let caught: unknown;
    try {
      db.exec(`INSERT INTO child (id, parent_id, tag) VALUES ('c2', 'p1', 'unique-tag')`);
    } catch (err) {
      caught = err;
    }
    expect(isUniqueConstraintError(caught)).toBe(true);
  });

  it('returns false for FK violations and non-DB errors', () => {
    const db = freshDb();
    let fk: unknown;
    try {
      db.exec(`INSERT INTO child (id, parent_id, tag) VALUES ('c1', 'missing', 't')`);
    } catch (err) {
      fk = err;
    }
    expect(isUniqueConstraintError(fk)).toBe(false);
    expect(isUniqueConstraintError(new Error('plain error'))).toBe(false);
    expect(isUniqueConstraintError(null)).toBe(false);
    expect(isUniqueConstraintError({})).toBe(false);
    expect(isUniqueConstraintError({ code: 123 })).toBe(false);
  });
});

describe('isForeignKeyConstraintError', () => {
  it('returns true for a real FK violation', () => {
    const db = freshDb();
    let caught: unknown;
    try {
      db.exec(`INSERT INTO child (id, parent_id, tag) VALUES ('c1', 'missing', 't')`);
    } catch (err) {
      caught = err;
    }
    expect(isForeignKeyConstraintError(caught)).toBe(true);
  });

  it('returns false for UNIQUE violations and non-DB errors', () => {
    const db = freshDb();
    db.exec(`INSERT INTO parent (id) VALUES ('p1')`);
    db.exec(`INSERT INTO child (id, parent_id, tag) VALUES ('c1', 'p1', 'unique-tag')`);
    let uniq: unknown;
    try {
      db.exec(`INSERT INTO child (id, parent_id, tag) VALUES ('c2', 'p1', 'unique-tag')`);
    } catch (err) {
      uniq = err;
    }
    expect(isForeignKeyConstraintError(uniq)).toBe(false);
    expect(isForeignKeyConstraintError(undefined)).toBe(false);
  });
});
