import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { drizzle } from 'drizzle-orm/better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createTestDb } from '../../../shared/test-utils.js';
import { TemplateRegistry } from '../templates/registry.js';
import { seedDefaultTemplates } from '../templates/seed.js';
import { listScopes } from './scopes-router.js';
import { EngramService } from './service.js';

import type { Database } from 'better-sqlite3';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';

/** A fixed clock that advances one minute per call. */
function makeClock(start = new Date('2026-04-18T09:00:00Z')): () => Date {
  let t = start.getTime();
  return () => {
    const d = new Date(t);
    t += 60_000;
    return d;
  };
}

function makeService(db: BetterSQLite3Database, root: string): EngramService {
  const templatesDir = join(root, '.templates');
  seedDefaultTemplates(templatesDir);
  return new EngramService({
    root,
    db,
    templates: new TemplateRegistry(templatesDir),
    now: makeClock(),
  });
}

// ---------------------------------------------------------------------------
// listScopes (pure DB helper)
// ---------------------------------------------------------------------------

describe('listScopes', () => {
  let rawDb: Database;
  let db: BetterSQLite3Database;
  let service: EngramService;
  let root: string;

  beforeEach(() => {
    rawDb = createTestDb();
    db = drizzle(rawDb);
    root = mkdtempSync(join(tmpdir(), 'scopes-router-'));
    service = makeService(db, root);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rawDb.close();
  });

  it('returns all scopes with counts', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'C', body: '# C', scopes: ['personal.journal'] });

    const scopes = listScopes(db);
    const wp = scopes.find((s) => s.scope === 'work.projects');
    const pj = scopes.find((s) => s.scope === 'personal.journal');
    expect(wp?.count).toBe(2);
    expect(pj?.count).toBe(1);
  });

  it('filters by prefix', () => {
    service.create({ type: 'note', title: 'A', body: '# A', scopes: ['work.projects'] });
    service.create({ type: 'note', title: 'B', body: '# B', scopes: ['personal.journal'] });

    const scopes = listScopes(db, 'work');
    expect(scopes).toHaveLength(1);
    expect(scopes[0]?.scope).toBe('work.projects');
  });

  it('returns empty when no engrams', () => {
    expect(listScopes(db)).toHaveLength(0);
  });

  it('handles engram with multiple scopes', () => {
    service.create({
      type: 'note',
      title: 'Multi',
      body: '# M',
      scopes: ['work.projects', 'work.meetings'],
    });
    const scopes = listScopes(db, 'work');
    expect(scopes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// EngramService scope inference integration
// ---------------------------------------------------------------------------

describe('EngramService.create scope inference', () => {
  let rawDb: Database;
  let db: BetterSQLite3Database;
  let root: string;

  beforeEach(() => {
    rawDb = createTestDb();
    db = drizzle(rawDb);
    root = mkdtempSync(join(tmpdir(), 'scope-infer-'));
    mkdirSync(join(root, '.config'), { recursive: true });
    mkdirSync(join(root, '.templates'), { recursive: true });
    seedDefaultTemplates(join(root, '.templates'));
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    rawDb.close();
  });

  it('uses explicit scopes when provided (no rule engine needed)', () => {
    const service = makeService(db, root);
    const engram = service.create({
      type: 'note',
      title: 'Explicit',
      body: '# E',
      scopes: ['work.projects'],
    });
    expect(engram.scopes).toEqual(['work.projects']);
  });

  it('still throws without scopes when no rule engine configured', () => {
    const service = makeService(db, root);
    expect(() => service.create({ type: 'note', title: 'No scope', body: '# x' })).toThrow();
  });
});
