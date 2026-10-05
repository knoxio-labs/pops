import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openAiDb } from '../open-ai-db.js';

let tmpDir: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-db-opener-'));
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('openAiDb', () => {
  it('closes the database handle when a pragma rejects an invalid SQLite file', () => {
    const path = join(tmpDir, 'ai.db');
    writeFileSync(path, 'this is not a sqlite file');

    const instances: Database.Database[] = [];
    const original = Database.prototype.pragma;
    const spy = vi.spyOn(Database.prototype, 'pragma').mockImplementation(function (
      this: Database.Database,
      ...args: [string]
    ) {
      instances.push(this);
      return original.apply(this, args);
    });

    try {
      expect(() => openAiDb(path)).toThrow();
    } finally {
      spy.mockRestore();
    }

    const captured = instances[0];
    if (captured === undefined)
      throw new Error('pragma() was never called — test did not capture the opened handle');
    expect(captured.open).toBe(false);
  });
});
