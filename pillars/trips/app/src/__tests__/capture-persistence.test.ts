import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { expect, it } from 'vitest';

import {
  createCaptureEditor,
  loadCaptureSource,
  performCaptureRequest,
} from '@pops/trips-workspace/capture-client';

import { createClient } from '../trips-api/client';

import type { CaptureIdentity, CaptureSource } from '@pops/trips-workspace/capture-client';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;
type FixtureIdentity = { origin: string; tripId: number };

async function withSource(
  run: (identity: CaptureIdentity, source: CaptureSource, nextId: () => string) => Promise<void>
) {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', resolve('../src/api/__tests__/capture-source.fixture.ts')],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const lines = createInterface({ input: child.stdout });
  try {
    const [line] = await Promise.race([
      once(lines, 'line'),
      once(child, 'exit').then(() => {
        throw new Error('Producer fixture exited before ready');
      }),
    ]);
    const fixture = parseIdentity(JSON.parse(String(line)));
    const identity = {
      tripId: fixture.tripId,
      client: createClient({ baseUrl: fixture.origin, headers: { 'x-api-key': 'fixture' } }),
    };
    let id = 0;
    await run(
      identity,
      await loadCaptureSource(identity),
      () => `00000000-0000-4000-8000-${String(++id).padStart(12, '0')}`
    );
  } finally {
    lines.close();
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill('SIGTERM');
      await exited;
    }
  }
}

function parseIdentity(value: unknown): FixtureIdentity {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('origin' in value) ||
    typeof value.origin !== 'string' ||
    !('tripId' in value) ||
    typeof value.tripId !== 'number'
  )
    throw new Error('Invalid fixture identity');
  return { origin: value.origin, tripId: value.tripId };
}

function makeEditor(
  identity: CaptureIdentity,
  source: CaptureSource,
  nextId: () => string,
  perform = (request: Parameters<typeof performCaptureRequest>[1]) =>
    performCaptureRequest(identity, request)
) {
  return createCaptureEditor({ source, tripId: identity.tripId, perform, newId: nextId });
}

it(
  'persists capture, Undo and recapture with the exact in-session File handle',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  async () => {
    await withSource(async (identity, source, nextId) => {
      const editor = makeEditor(identity, source, nextId);
      const file = new File(['payload'], 'notes.txt', { type: 'text/plain' });
      editor.addSelection({
        file,
        name: file.name,
        mediaType: file.type,
        references: [{ kind: 'task', taskId: 'accepted_task_1' }],
      });
      editor.editDraft({ originalText: '旅程 🗺️\nraw source', classification: 'note' });
      expect(await editor.capture()).toBe(true);
      expect((await loadCaptureSource(identity)).captures[0]).toMatchObject({
        originalText: '旅程 🗺️\nraw source',
        attachments: [{ kind: 'task', taskId: 'accepted_task_1' }],
      });
      expect(await editor.undo()).toBe(true);
      expect(editor.getState().draft.originalText).toBe('旅程 🗺️\nraw source');
      expect(editor.getState().draft.selections[0]?.file).toBe(file);
      expect(await editor.capture()).toBe(true);
      expect(
        (await loadCaptureSource(identity)).captures.filter((capture) => capture.removedAt === null)
      ).toHaveLength(1);
    });
  }
);

it(
  'replays the exact create UUID after a lost response and preserves the owner receipt after Undo',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  async () => {
    await withSource(async (identity, source, nextId) => {
      const requests: Parameters<typeof performCaptureRequest>[1][] = [];
      let loseResponse = true;
      const editor = makeEditor(identity, source, nextId, async (request) => {
        requests.push(request);
        const result = await performCaptureRequest(identity, request);
        if (loseResponse) {
          loseResponse = false;
          throw new Error('response lost after commit');
        }
        return result;
      });
      editor.editDraft({ originalText: 'Retry me exactly' });
      expect(await editor.capture()).toBe(false);
      expect(await editor.retry()).toBe(true);
      const original = requests[0];
      if (!original || 'scope' in original) throw new Error('Missing create request');
      expect(requests[1]).toEqual(original);
      expect(
        (await loadCaptureSource(identity)).captures.filter((capture) => capture.removedAt === null)
      ).toHaveLength(1);
      expect(await editor.undo()).toBe(true);
      const replay = await performCaptureRequest(identity, original);
      expect(replay.undone).toBe(true);
      expect(
        (await loadCaptureSource(identity)).captures.filter((capture) => capture.removedAt === null)
      ).toHaveLength(0);
    });
  }
);

it(
  'applies create, update and both inverse operations in LIFO order',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  async () => {
    await withSource(async (identity, source, nextId) => {
      const editor = makeEditor(identity, source, nextId);
      editor.editDraft({ originalText: 'Original' });
      expect(await editor.capture()).toBe(true);
      const capture = editor.getState().source.captures[0];
      if (!capture) throw new Error('Created capture missing');
      expect(
        await editor.commit(
          {
            kind: 'capture.update',
            id: capture.id,
            expectedRevision: capture.revision,
            input: { title: 'Edited' },
          },
          'Edit title'
        )
      ).toBe(true);
      expect(await editor.undo()).toBe(true);
      expect(
        editor.getState().source.captures.find((row) => row.id === capture.id)?.title
      ).toBeNull();
      expect(await editor.undo()).toBe(true);
      expect(
        (await loadCaptureSource(identity)).captures.find((row) => row.id === capture.id)?.removedAt
      ).not.toBeNull();
    });
  }
);

it(
  'returns 409 for a foreign update and preserves that source and the local draft',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  async () => {
    await withSource(async (identity, source, nextId) => {
      const editor = makeEditor(identity, source, nextId);
      editor.editDraft({ originalText: 'Source' });
      expect(await editor.capture()).toBe(true);
      const capture = editor.getState().source.captures[0];
      if (!capture) throw new Error('Created capture missing');
      expect(
        await editor.commit(
          {
            kind: 'capture.update',
            id: capture.id,
            expectedRevision: capture.revision,
            input: { title: 'Local' },
          },
          'Edit title'
        )
      ).toBe(true);
      editor.editDraft({ originalText: 'Keep this draft' });
      await performCaptureRequest(identity, {
        operationId: nextId(),
        command: {
          kind: 'capture.update',
          id: capture.id,
          expectedRevision: capture.revision + 1,
          input: { title: 'Foreign' },
        },
      });
      expect(await editor.undo()).toBe(false);
      expect(editor.getState().draft.originalText).toBe('Keep this draft');
      expect(editor.getState().failure?.error).toMatchObject({ status: 409 });
      expect(
        (await loadCaptureSource(identity)).captures.find((row) => row.id === capture.id)?.title
      ).toBe('Foreign');
    });
  }
);
