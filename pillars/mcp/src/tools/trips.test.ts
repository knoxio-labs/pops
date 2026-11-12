import { readFileSync } from 'node:fs';

import { CallToolResultSchema } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { contractInputs } from '../contract-inputs.js';
import { openApiObject } from './openapi-values.js';
import {
  operationId,
  operationResult,
  sourceText,
  tripCreationResult,
  workspace,
} from './trips/test-helpers.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { CallDynamicFn } from '@pops/pillar-sdk/client';

const { callDynamic, getPillar } = vi.hoisted(() => {
  const callDynamic = vi.fn<CallDynamicFn>();
  return { callDynamic, getPillar: vi.fn(() => ({ callDynamic })) };
});
vi.mock('../pillar-client.js', () => ({ getPillar }));
const { tripsTools } = await import('./trips.js');
const { allTools } = await import('./index.js');

function tool(name: string) {
  const found = tripsTools.find((entry) => entry.name === `trips.${name}`);
  if (found === undefined) throw new Error(`Missing Trips tool ${name}`);
  return found;
}

function text(result: CallToolResult): string {
  return result.content.flatMap((item) => (item.type === 'text' ? [item.text] : [])).join('\n');
}

beforeEach(() => {
  vi.clearAllMocks();
  callDynamic.mockResolvedValue({
    kind: 'bad-request',
    pillar: 'trips',
    message: 'Producer validation',
  });
});

describe('finite canonical Trips MCP surface', () => {
  it('registers exactly the published business operations with exact scopes and read/write annotations', () => {
    const document: unknown = JSON.parse(readFileSync(contractInputs.trips, 'utf8'));
    const expected = new Map<string, boolean>();
    for (const path of Object.values(
      openApiObject(openApiObject(document, 'document')['paths'], 'paths')
    )) {
      for (const [method, value] of Object.entries(openApiObject(path, 'path'))) {
        const operation = openApiObject(value, 'operation');
        if (typeof operation['operationId'] === 'string')
          expected.set(`trips.${operation['operationId']}`, method === 'get');
      }
    }
    expect(expected.size).toBe(89);
    expect(tripsTools).toHaveLength(89);
    expect(new Set(tripsTools.map((entry) => entry.name)).size).toBe(89);
    expect(tripsTools.map((entry) => entry.name).toSorted()).toEqual(
      [...expected.keys()].toSorted()
    );
    for (const entry of tripsTools) {
      expect(entry.scope).toBe(entry.name);
      expect(entry.readOnly).toBe(expected.get(entry.name));
      expect(entry.description.trim()).not.toBe('');
      expect(allTools.find((registered) => registered.name === entry.name)).toBe(entry);
    }
  });

  it('reads the canonical workspace unchanged through the owning SDK operation', async () => {
    callDynamic.mockResolvedValueOnce({ kind: 'ok', value: workspace });
    const result = await tool('captureWorkspace.get').handler({ tripId: 7 });
    expect(getPillar).toHaveBeenCalledWith('trips');
    expect(callDynamic).toHaveBeenCalledExactlyOnceWith(
      'captureWorkspace',
      'get',
      { tripId: 7 },
      'query'
    );
    expect(text(result)).toBe(JSON.stringify(workspace));
    expect(CallToolResultSchema.safeParse(result).success).toBe(true);
  });

  it('preserves immutable raw text, explicit UUID, omitted fields and the producer receipt', async () => {
    const args = {
      tripId: 7,
      operationId,
      command: { kind: 'capture.create', input: { originalText: sourceText } },
    };
    callDynamic.mockResolvedValueOnce({ kind: 'ok', value: operationResult });
    const result = await tool('captures.create').handler(args);
    expect(callDynamic).toHaveBeenCalledExactlyOnceWith('captures', 'create', args, 'mutation');
    expect(text(result)).toBe(JSON.stringify(operationResult));
    expect(args.command.input).toEqual({ originalText: sourceText });
  });

  it.each([
    [
      'captures.create',
      {
        tripId: 7,
        operationId: 'invalid',
        command: { kind: 'capture.create', input: { originalText: 'x' } },
      },
    ],
    [
      'trips.createOperation',
      { operationId: 'invalid', command: { kind: 'trip.create', input: {} } },
    ],
    [
      'trips.createOperation',
      {
        operationId,
        command: { kind: 'trip.create', input: { name: 'Original', invented: true } },
      },
    ],
    [
      'captures.create',
      {
        tripId: 7,
        operationId,
        command: {
          kind: 'capture.create',
          input: { originalText: 'x', classification: 'activity' },
        },
      },
    ],
    [
      'captures.create',
      {
        tripId: 7,
        operationId,
        command: {
          kind: 'capture.create',
          input: { originalText: '', attachments: [{ kind: 'file', name: 'fake.pdf' }] },
        },
      },
    ],
    [
      'ideas.update',
      { tripId: 7, operationId, command: { kind: 'idea.update', id: 1, input: { notes: 'x' } } },
    ],
    ['trips.get', { id: '7' }],
    ['trips.get', { id: 0 }],
    ['trips.list', { method: 'DELETE', path: '/arbitrary' }],
    [
      'documentAssociations.create',
      { tripId: 7, documentId: 3, targetKind: 'rental', targetId: 1 },
    ],
  ])(
    'rejects malformed or undeclared %s arguments before any producer call',
    async (name, args) => {
      const result = await tool(name).handler(args);
      expect(result.isError).toBe(true);
      expect(callDynamic).not.toHaveBeenCalled();
      expect(getPillar).not.toHaveBeenCalled();
    }
  );

  it('passes valid explicit Idea subtype/null choices without mapping or inferred route insertion', async () => {
    const args = {
      tripId: 7,
      operationId,
      command: {
        kind: 'idea.create',
        input: { kind: 'activity', name: null, visitId: null, notes: 'Original' },
      },
    };
    await tool('ideas.create').handler(args);
    expect(callDynamic).toHaveBeenCalledExactlyOnceWith('ideas', 'create', args, 'mutation');
  });

  it.each([{}, { date: '2028-02-29' }, { date: null }, { local: '2028-02-29T11:22:33.123' }])(
    'forwards exact Journey endpoint precision %j without adding a clock, zone or clear',
    async (from) => {
      const args = { tripId: 7, journeyId: 20, id: 40, expectedRevision: 3, from };
      await tool('journeyLegs.update').handler(args);
      expect(callDynamic).toHaveBeenCalledExactlyOnceWith(
        'journeyLegs',
        'update',
        args,
        'mutation'
      );
    }
  );

  it('preserves tagged identity when capture and target share the same numeric ID', async () => {
    const args = {
      tripId: 7,
      operationId,
      command: {
        kind: 'capture.organise',
        id: 1,
        expectedRevision: 1,
        target: { mode: 'existing', target: { kind: 'idea', id: 1 } },
      },
    };
    await tool('captures.organise').handler(args);
    expect(callDynamic).toHaveBeenCalledExactlyOnceWith('captures', 'organise', args, 'mutation');
  });

  it('reports authorization/conflict metadata under the exact producer scope', async () => {
    callDynamic.mockResolvedValueOnce({
      kind: 'unauthorized',
      pillar: 'trips',
      message: 'Missing grant',
      code: 'scope_denied',
    });
    const denied = await tool('trips.create').handler({ name: 'Explicit name' });
    expect(denied.isError).toBe(true);
    expect(text(denied)).toContain('trips.trips.create');
    expect(text(denied)).toContain('scope_denied');
    callDynamic.mockResolvedValueOnce({
      kind: 'conflict',
      pillar: 'trips',
      message: 'Payload mismatch',
      code: 'source_operation_mismatch',
      details: { operationId },
    });
    const conflict = await tool('captures.create').handler({
      tripId: 7,
      operationId,
      command: { kind: 'capture.create', input: { originalText: sourceText } },
    });
    expect(conflict.isError).toBe(true);
    expect(text(conflict)).toContain('source_operation_mismatch');
    expect(text(conflict)).toContain(operationId);
    expect(callDynamic).toHaveBeenCalledTimes(2);
  });

  it('keeps unknown receipt-backed retries explicit and preserves replay/Undo outcomes', async () => {
    const args = {
      tripId: 7,
      operationId,
      command: { kind: 'capture.create', input: { originalText: sourceText } },
    };
    callDynamic.mockResolvedValueOnce({ kind: 'unavailable', pillar: 'trips' });
    const unknown = await tool('captures.create').handler(args);
    expect(text(unknown)).toContain('original operationId');
    expect(callDynamic).toHaveBeenCalledTimes(1);
    const replay = {
      ...operationResult,
      current: { ...workspace, captures: [] },
      replayed: true,
      undone: true,
    };
    callDynamic.mockResolvedValueOnce({ kind: 'ok', value: replay });
    const retried = await tool('captures.create').handler(args);
    expect(callDynamic).toHaveBeenLastCalledWith('captures', 'create', args, 'mutation');
    expect(text(retried)).toBe(JSON.stringify(replay));
  });

  it('does not recommend a blind replay for non-receipted creates', async () => {
    callDynamic.mockResolvedValueOnce({ kind: 'unavailable', pillar: 'trips' });
    const result = await tool('trips.create').handler({ name: 'Explicit name' });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Do not automatically repeat');
    expect(callDynamic).toHaveBeenCalledTimes(1);
  });

  it('retains the exact durable creation command and separate receipt/current on explicit retry', async () => {
    const args = {
      operationId,
      command: { kind: 'trip.create', input: { name: 'Original', when: sourceText } },
    };
    callDynamic.mockResolvedValueOnce({ kind: 'unavailable', pillar: 'trips' });
    const unknown = await tool('trips.createOperation').handler(args);
    expect(unknown.isError).toBe(true);
    expect(text(unknown)).toContain('unchanged full command input');
    expect(callDynamic).toHaveBeenCalledExactlyOnceWith(
      'trips',
      'createOperation',
      args,
      'mutation'
    );
    callDynamic.mockResolvedValueOnce({ kind: 'ok', value: tripCreationResult });
    const replay = await tool('trips.createOperation').handler(args);
    expect(text(replay)).toBe(JSON.stringify(tripCreationResult));
    expect(callDynamic).toHaveBeenLastCalledWith('trips', 'createOperation', args, 'mutation');
    expect(callDynamic).toHaveBeenCalledTimes(2);
  });

  it.each(['not-found', 'contract-mismatch'] as const)(
    'retains missing durable creation capability without a legacy fallback: %s',
    async (kind) => {
      const args = { operationId, command: { kind: 'trip.create', input: { name: 'Original' } } };
      callDynamic.mockResolvedValueOnce({ kind, pillar: 'trips' });
      const result = await tool('trips.createOperation').handler(args);
      expect(result.isError).toBe(true);
      expect(text(result)).toContain('Durable Trip creation capability is unavailable');
      expect(text(result)).toContain('Never fall back');
      expect(callDynamic).toHaveBeenCalledExactlyOnceWith(
        'trips',
        'createOperation',
        args,
        'mutation'
      );
      expect(args.operationId).toBe(operationId);
    }
  );

  it('refuses malformed producer successes and preserves an actual no-content confirmation', async () => {
    callDynamic.mockResolvedValueOnce({ kind: 'ok', value: {} });
    const malformed = await tool('captureWorkspace.get').handler({ tripId: 7 });
    expect(malformed.isError).toBe(true);
    expect(text(malformed)).toContain('outside the published');
    callDynamic.mockResolvedValueOnce({ kind: 'ok', value: undefined });
    const removed = await tool('documentAssociations.delete').handler({ tripId: 7, id: 3 });
    expect(removed).toEqual({ content: [] });
    expect(CallToolResultSchema.safeParse(removed).success).toBe(true);
  });
});
