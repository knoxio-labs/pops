/**
 * Offline tests for the curation worker handler.
 *
 * Drives `processCurationJob` directly (no BullMQ) against a per-test temp
 * `cerebrum.db` + temp engram root, a real {@link EngramService} seeding a
 * `capture` engram, and an injected fake {@link IngestLlm} (no Anthropic). The
 * fake returns canned classify / extract / scope-inference responses so the
 * enrichment runs through the SAME pipeline modules the API's `IngestService`
 * uses, end to end.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeFakeIngestLlm } from '../../api/__tests__/test-utils.js';
import { EngramService } from '../../api/modules/engrams/service.js';
import { TemplateRegistry } from '../../api/modules/templates/registry.js';
import { hashContent } from '../../api/modules/thalamus/chunker.js';
import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { processCurationJob, type CurationHandlerDeps } from '../curation-handler.js';

import type { IngestLlm } from '../../api/modules/ingest/llm.js';

const TEMPLATES_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'api',
  'modules',
  'templates',
  'defaults'
);
const CLASSIFY_OP = 'cerebrum.classify';
const EXTRACT_OP = 'cerebrum.extract-entities';
const INFER_OP = 'cerebrum.infer-scopes';

let tmpDir: string;
let engramRoot: string;
let cerebrumDb: OpenedCerebrumDb;
let templates: TemplateRegistry;

function makeDeps(llm: IngestLlm): CurationHandlerDeps {
  return { db: cerebrumDb.db, engramRoot, templates, llm };
}

function seedCapture(body = 'We chose SQLite over Postgres for the embeddings store.') {
  const service = new EngramService({ root: engramRoot, db: cerebrumDb.db, templates });
  return service.create({
    type: 'capture',
    title: 'Captured thought',
    body,
    scopes: ['personal.captures'],
  });
}

function seedTyped(type: string) {
  const service = new EngramService({ root: engramRoot, db: cerebrumDb.db, templates });
  return service.create({
    type,
    title: 'Typed thought',
    body: 'We chose SQLite over Postgres for the embeddings store.',
    scopes: ['personal.captures'],
  });
}

const CONFIDENT_NOTE = JSON.stringify({
  type: 'note',
  confidence: 0.9,
  template: null,
  suggested_tags: [],
});
const LOW_CONFIDENCE_NOTE = JSON.stringify({
  type: 'note',
  confidence: 0.3,
  template: null,
  suggested_tags: [],
});
const EMPTY_ENTITIES = JSON.stringify([]);
const INFERRED_SCOPES = JSON.stringify({ scopes: ['personal.notes'], confidence: 0.7 });

function readEngram(id: string) {
  return new EngramService({ root: engramRoot, db: cerebrumDb.db, templates }).read(id);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-worker-cur-db-'));
  engramRoot = mkdtempSync(join(tmpdir(), 'cerebrum-worker-cur-root-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'), { loadVec: false });
  templates = new TemplateRegistry(TEMPLATES_DIR);
});

afterEach(() => {
  cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  rmSync(engramRoot, { recursive: true, force: true });
});

describe('processCurationJob', () => {
  it('runs classify + extract + scope inference and writes them onto the engram', async () => {
    const created = seedCapture();
    const llm = makeFakeIngestLlm({
      [CLASSIFY_OP]: () =>
        JSON.stringify({
          type: 'decision',
          confidence: 0.95,
          template: 'decision',
          suggested_tags: ['architecture', 'database'],
        }),
      [EXTRACT_OP]: () =>
        JSON.stringify([{ type: 'topic', value: 'sqlite', normalised: 'sqlite', confidence: 0.9 }]),
      [INFER_OP]: () => JSON.stringify({ scopes: ['work.decisions'], confidence: 0.85 }),
    });

    const result = await processCurationJob(makeDeps(llm), {
      type: 'classifyEngram',
      engramId: created.id,
    });
    expect(result.enriched).toBe(true);

    const { engram, body } = readEngram(created.id);
    expect(engram.type).toBe('decision');
    expect(engram.template).toBe('decision');
    expect(engram.scopes).toEqual(['work.decisions']);
    expect(engram.tags).toContain('topic:sqlite');
    expect(engram.tags).toContain('architecture');
    expect(engram.customFields['_enrichedHash']).toBe(hashContent(body));
  });

  it('is idempotent — a second run with unchanged content is skipped', async () => {
    const created = seedCapture();
    let extractCalls = 0;
    const llm = makeFakeIngestLlm({
      [CLASSIFY_OP]: () =>
        JSON.stringify({ type: 'note', confidence: 0.9, template: null, suggested_tags: [] }),
      [EXTRACT_OP]: () => {
        extractCalls += 1;
        return JSON.stringify([]);
      },
      [INFER_OP]: () => JSON.stringify({ scopes: ['personal.notes'], confidence: 0.7 }),
    });
    const deps = makeDeps(llm);

    const first = await processCurationJob(deps, { type: 'classifyEngram', engramId: created.id });
    expect(first.enriched).toBe(true);
    expect(extractCalls).toBe(1);

    const second = await processCurationJob(deps, { type: 'classifyEngram', engramId: created.id });
    expect(second.enriched).toBe(false);
    expect(extractCalls).toBe(1);
  });

  it('reconciles user-supplied scopes when _reconcile_scopes is set', async () => {
    const service = new EngramService({ root: engramRoot, db: cerebrumDb.db, templates });
    const created = service.create({
      type: 'capture',
      title: 'Reconcile me',
      body: 'A capture with user scopes that should be preserved.',
      scopes: ['work.projct.alpha'],
      customFields: { _reconcile_scopes: true },
    });

    const llm = makeFakeIngestLlm({
      [CLASSIFY_OP]: () =>
        JSON.stringify({ type: 'note', confidence: 0.9, template: null, suggested_tags: [] }),
      [EXTRACT_OP]: () => JSON.stringify([]),
    });

    await processCurationJob(makeDeps(llm), { type: 'classifyEngram', engramId: created.id });

    const { engram, body } = readEngram(created.id);
    expect(engram.scopes).toEqual(['work.projct.alpha']);
    expect(engram.customFields['_enrichedHash']).toBe(hashContent(body));
  });

  describe('degraded and low-confidence runs', () => {
    it('leaves a user-set type and the hash untouched when every LLM call returns null', async () => {
      const created = seedTyped('decision');
      const result = await processCurationJob(makeDeps(makeFakeIngestLlm()), {
        type: 'classifyEngram',
        engramId: created.id,
      });
      expect(result.degraded).toBe(true);
      expect(result.enriched).toBe(false);

      const { engram } = readEngram(created.id);
      expect(engram.type).toBe('decision');
      expect(engram.scopes).toEqual(['personal.captures']);
      expect(engram.customFields['_enrichedHash']).toBeUndefined();
    });

    it('does not stamp the hash when only the classifier output is unparseable', async () => {
      const created = seedCapture();
      const llm = makeFakeIngestLlm({
        [CLASSIFY_OP]: () => 'not json at all',
        [EXTRACT_OP]: () => EMPTY_ENTITIES,
        [INFER_OP]: () => INFERRED_SCOPES,
      });
      const result = await processCurationJob(makeDeps(llm), {
        type: 'classifyEngram',
        engramId: created.id,
      });
      expect(result.degraded).toBe(true);
      expect(readEngram(created.id).engram.customFields['_enrichedHash']).toBeUndefined();
    });

    it('does not stamp the hash when only entity extraction is unparseable', async () => {
      const created = seedCapture();
      const llm = makeFakeIngestLlm({
        [CLASSIFY_OP]: () => CONFIDENT_NOTE,
        [EXTRACT_OP]: () => 'garbage',
        [INFER_OP]: () => INFERRED_SCOPES,
      });
      const result = await processCurationJob(makeDeps(llm), {
        type: 'classifyEngram',
        engramId: created.id,
      });
      expect(result.degraded).toBe(true);
      expect(readEngram(created.id).engram.customFields['_enrichedHash']).toBeUndefined();
    });

    it('does not stamp the hash or replace scopes when scope inference fails', async () => {
      const created = new EngramService({ root: engramRoot, db: cerebrumDb.db, templates }).create({
        type: 'capture',
        title: 'Scoped capture',
        body: 'A capture whose scope must survive a failed inference.',
        scopes: ['work.projects.alpha'],
      });
      const llm = makeFakeIngestLlm({
        [CLASSIFY_OP]: () => CONFIDENT_NOTE,
        [EXTRACT_OP]: () => EMPTY_ENTITIES,
      });
      const result = await processCurationJob(makeDeps(llm), {
        type: 'classifyEngram',
        engramId: created.id,
      });
      expect(result.degraded).toBe(true);
      const { engram } = readEngram(created.id);
      expect(engram.scopes).toEqual(['work.projects.alpha']);
      expect(engram.customFields['_enrichedHash']).toBeUndefined();
    });

    it('re-enriches on the next run after a degraded one', async () => {
      const created = seedCapture();
      const deps = makeDeps(makeFakeIngestLlm());
      await processCurationJob(deps, { type: 'classifyEngram', engramId: created.id });

      const healthy = makeDeps(
        makeFakeIngestLlm({
          [CLASSIFY_OP]: () => CONFIDENT_NOTE,
          [EXTRACT_OP]: () => EMPTY_ENTITIES,
          [INFER_OP]: () => INFERRED_SCOPES,
        })
      );
      const result = await processCurationJob(healthy, {
        type: 'classifyEngram',
        engramId: created.id,
      });
      expect(result.enriched).toBe(true);
      const { engram, body } = readEngram(created.id);
      expect(engram.type).toBe('note');
      expect(engram.customFields['_enrichedHash']).toBe(hashContent(body));
    });

    it('keeps a non-capture type on a low-confidence classification and still stamps', async () => {
      const created = seedTyped('decision');
      const llm = makeFakeIngestLlm({
        [CLASSIFY_OP]: () => LOW_CONFIDENCE_NOTE,
        [EXTRACT_OP]: () => EMPTY_ENTITIES,
        [INFER_OP]: () => INFERRED_SCOPES,
      });
      const result = await processCurationJob(makeDeps(llm), {
        type: 'classifyEngram',
        engramId: created.id,
      });
      expect(result.enriched).toBe(true);
      const { engram, body } = readEngram(created.id);
      expect(engram.type).toBe('decision');
      expect(engram.customFields['_enrichedHash']).toBe(hashContent(body));
    });

    it('keeps a capture engram a capture on a low-confidence classification', async () => {
      const created = seedCapture();
      const llm = makeFakeIngestLlm({
        [CLASSIFY_OP]: () => LOW_CONFIDENCE_NOTE,
        [EXTRACT_OP]: () => EMPTY_ENTITIES,
        [INFER_OP]: () => INFERRED_SCOPES,
      });
      await processCurationJob(makeDeps(llm), { type: 'classifyEngram', engramId: created.id });
      expect(readEngram(created.id).engram.type).toBe('capture');
    });

    it('never overwrites a non-capture type even when the classification is confident', async () => {
      const created = seedTyped('decision');
      const llm = makeFakeIngestLlm({
        [CLASSIFY_OP]: () => CONFIDENT_NOTE,
        [EXTRACT_OP]: () => EMPTY_ENTITIES,
        [INFER_OP]: () => INFERRED_SCOPES,
      });
      await processCurationJob(makeDeps(llm), { type: 'classifyEngram', engramId: created.id });
      expect(readEngram(created.id).engram.type).toBe('decision');
    });
  });

  describe('force', () => {
    function countingLlm(counter: { extract: number }): IngestLlm {
      return makeFakeIngestLlm({
        [CLASSIFY_OP]: () => CONFIDENT_NOTE,
        [EXTRACT_OP]: () => {
          counter.extract += 1;
          return EMPTY_ENTITIES;
        },
        [INFER_OP]: () => INFERRED_SCOPES,
      });
    }

    it('re-runs enrichment on an already-stamped engram', async () => {
      const created = seedCapture();
      const counter = { extract: 0 };
      const deps = makeDeps(countingLlm(counter));
      await processCurationJob(deps, { type: 'classifyEngram', engramId: created.id });
      expect(counter.extract).toBe(1);

      const forced = await processCurationJob(deps, {
        type: 'classifyEngram',
        engramId: created.id,
        force: true,
      });
      expect(forced.enriched).toBe(true);
      expect(counter.extract).toBe(2);
    });

    it('still honours the guard when force is false', async () => {
      const created = seedCapture();
      const counter = { extract: 0 };
      const deps = makeDeps(countingLlm(counter));
      await processCurationJob(deps, { type: 'classifyEngram', engramId: created.id });
      const second = await processCurationJob(deps, {
        type: 'classifyEngram',
        engramId: created.id,
        force: false,
      });
      expect(second.enriched).toBe(false);
      expect(counter.extract).toBe(1);
    });
  });

  describe('scope vocabulary', () => {
    it('passes the known scopes to the inference prompt and snaps a near-duplicate output', async () => {
      const service = new EngramService({ root: engramRoot, db: cerebrumDb.db, templates });
      service.create({
        type: 'note',
        title: 'Existing',
        body: 'An existing engram that defines vocabulary.',
        scopes: ['work.projects.karbon'],
      });
      const created = seedCapture();
      let prompt = '';
      const llm = makeFakeIngestLlm({
        [CLASSIFY_OP]: () => CONFIDENT_NOTE,
        [EXTRACT_OP]: () => EMPTY_ENTITIES,
        [INFER_OP]: (req) => {
          prompt = req.prompt;
          return JSON.stringify({ scopes: ['work.karbon.projects'], confidence: 0.8 });
        },
      });
      await processCurationJob(makeDeps(llm), { type: 'classifyEngram', engramId: created.id });

      expect(prompt).toContain('work.projects.karbon');
      expect(prompt).toContain('Prefer one of these existing scopes');
      expect(readEngram(created.id).engram.scopes).toEqual(['work.projects.karbon']);
    });
  });
});
