/**
 * Integration tests for `POST /codes/suggest`, driven through the real
 * Express app with a fake model in place of the Anthropic client.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';

import type { CodeModel, CodeModelReply } from '../modules/ai-codes/model.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let aiDb: OpenedAiDb;

function app(codeModel: CodeModel | null) {
  return createAiApiApp({
    aiDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3008',
    codeModel,
  });
}

function replying(reply: CodeModelReply): CodeModel {
  return vi.fn(() => Promise.resolve(reply));
}

function json(suggestions: { code: string; reason: string }[]): CodeModelReply {
  return { kind: 'text', text: JSON.stringify({ suggestions }) };
}

const body = {
  item: { name: 'Office 5', typeKey: 'storage_box', typeLabel: 'Storage box', isContainer: true },
  destination: { path: ['Home', 'Office'] },
  existing: [
    { code: 'BOX-OFFICE-4', name: 'Office 4', typeKey: 'storage_box', place: 'Home > Office' },
  ],
  count: 2,
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-codes-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
});

afterEach(() => {
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('POST /codes/suggest', () => {
  it('returns the model suggestions with their reasons', async () => {
    const model = replying(
      json([
        { code: 'BOX-OFFICE-5', reason: 'Continues BOX-OFFICE.' },
        { code: 'BOX-HOME-1', reason: 'New family by area.' },
      ])
    );
    const res = await requestOn(app(model)).post('/codes/suggest').send(body);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      suggestions: [
        { code: 'BOX-OFFICE-5', reason: 'Continues BOX-OFFICE.' },
        { code: 'BOX-HOME-1', reason: 'New family by area.' },
      ],
    });
  });

  it('sends the item, destination and existing codes to the model', async () => {
    const model = replying(json([{ code: 'BOX-OFFICE-5', reason: 'x' }]));
    await requestOn(app(model)).post('/codes/suggest').send(body);

    const prompt = vi.mocked(model).mock.calls[0]?.[0] ?? '';
    expect(prompt).toContain('Name: Office 5');
    expect(prompt).toContain('Destination: Home > Office');
    expect(prompt).toContain('BOX-OFFICE-4 | Office 4 | storage_box | Home > Office');
    expect(prompt).toContain('Return exactly 2 suggestions');
  });

  it('drops a code already in use, whatever its case', async () => {
    const model = replying(
      json([
        { code: 'box-office-4', reason: 'taken' },
        { code: 'BOX-OFFICE-5', reason: 'free' },
      ])
    );
    const res = await requestOn(app(model)).post('/codes/suggest').send(body);

    expect(res.status).toBe(200);
    expect(res.body.suggestions).toEqual([{ code: 'BOX-OFFICE-5', reason: 'free' }]);
  });

  it('503s when no model is configured', async () => {
    const res = await requestOn(app(null)).post('/codes/suggest').send(body);

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'ai.upstream.unavailable', retryable: true });
  });

  it.each([{ kind: 'refused' as const }, { kind: 'truncated' as const }])(
    '503s when the model reply is $kind',
    async (reply) => {
      const res = await requestOn(app(replying(reply)))
        .post('/codes/suggest')
        .send(body);

      expect(res.status).toBe(503);
    }
  );

  it('503s when the reply is not the demanded JSON', async () => {
    const model = replying({ kind: 'text', text: 'BOX-OFFICE-5' });
    const res = await requestOn(app(model)).post('/codes/suggest').send(body);

    expect(res.status).toBe(503);
  });

  it('503s when every suggestion is filtered out', async () => {
    const model = replying(json([{ code: 'BOX-OFFICE-4', reason: 'taken' }]));
    const res = await requestOn(app(model)).post('/codes/suggest').send(body);

    expect(res.status).toBe(503);
  });

  it('400s a count outside 1–5 without calling the model', async () => {
    const model = replying(json([{ code: 'X-1', reason: 'x' }]));
    const res = await requestOn(app(model))
      .post('/codes/suggest')
      .send({ ...body, count: 6 });

    expect(res.status).toBe(400);
    expect(model).not.toHaveBeenCalled();
  });

  it('is reachable with no service-account key at all', async () => {
    const model = replying(json([{ code: 'BOX-OFFICE-5', reason: 'x' }]));
    const res = await requestOn(app(model)).post('/codes/suggest').send(body);

    expect(res.status).toBe(200);
  });
});
