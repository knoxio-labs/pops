import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { expect, it } from 'vitest';

import { unwrap } from '@pops/pillar-sdk/client';
import {
  applyDecisionCommand,
  loadDecision,
  createDecisionEditor,
} from '@pops/trips-workspace/decision-client';

import { createClient } from '../trips-api/client';
import { decisionOptionsUpdate, journeysDelete, journeysGet } from '../trips-api/sdk.gen';

const REAL_SUBPROCESS_TIMEOUT_MS = 60_000;

it(
  'restores an unlinked unavailable source through the actual editor inverse, generated HTTP client and SQLite producer',
  { timeout: REAL_SUBPROCESS_TIMEOUT_MS },
  async () => {
    const fixture = resolve('../src/api/__tests__/decision-source.fixture.ts');
    const child = spawn(process.execPath, ['--import', 'tsx', fixture], {
      stdio: ['ignore', 'pipe', 'inherit'],
    });
    const lines = createInterface({ input: child.stdout });
    try {
      const [line] = await Promise.race([
        once(lines, 'line'),
        once(child, 'exit').then(() => {
          throw new Error('Producer fixture exited before ready');
        }),
      ]);
      const identity: unknown = JSON.parse(String(line));
      if (
        typeof identity !== 'object' ||
        identity === null ||
        !('origin' in identity) ||
        typeof identity.origin !== 'string' ||
        !('tripId' in identity) ||
        typeof identity.tripId !== 'number' ||
        !('decisionId' in identity) ||
        typeof identity.decisionId !== 'number' ||
        !('optionId' in identity) ||
        typeof identity.optionId !== 'number' ||
        !('journeyId' in identity) ||
        typeof identity.journeyId !== 'number'
      )
        throw new Error('Invalid fixture identity');
      let failNext = false;
      const transport: typeof globalThis.fetch = (input, init) => {
        if (!failNext) return globalThis.fetch(input, init);
        failNext = false;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              code: 'trips.test.unavailable',
              message: 'Try again',
              retryable: true,
            }),
            { status: 503, headers: { 'content-type': 'application/json' } }
          )
        );
      };
      const props = {
        tripId: identity.tripId,
        decisionId: identity.decisionId,
        client: createClient({
          baseUrl: identity.origin,
          headers: { 'x-api-key': 'fixture' },
          fetch: transport,
        }),
      };
      const initial = await loadDecision(props);
      const editor = createDecisionEditor(initial, (source, command) =>
        applyDecisionCommand(props, source, command)
      );
      unwrap(
        await journeysDelete({
          client: props.client,
          path: { tripId: identity.tripId, id: identity.journeyId },
        }).then((result) => ({
          ...result,
          data: result.response?.status === 204 ? true : undefined,
        }))
      );
      expect(
        await editor.commit(
          { kind: 'edit-option', id: identity.optionId, fields: { affectedSources: [] } },
          'Unlink source'
        )
      ).toBe(true);
      expect(editor.getState().source).toMatchObject({
        decision: { revision: 2 },
        options: [{ affectedSources: [] }],
      });
      failNext = true;
      expect(await editor.undo()).toBe(false);
      expect(editor.getState().undoCount).toBe(1);
      const failure = editor.getState().failures[0];
      if (!failure) throw new Error('Missing transient inverse failure');
      expect(failure.expectedRevision).toBe(2);
      expect(await editor.retry(failure)).toBe(true);
      const restored = await loadDecision(props);
      expect(restored).toMatchObject({
        decision: { revision: 3 },
        options: [{ affectedSources: [{ kind: 'journey', id: identity.journeyId }] }],
      });
      expect(restored.options[0]).not.toHaveProperty('validatedSources');
      expect(
        (
          await journeysGet({
            client: props.client,
            path: { tripId: identity.tripId, id: identity.journeyId },
          })
        ).response?.status
      ).toBe(404);
      expect(
        await editor.commit(
          {
            kind: 'edit-option',
            id: identity.optionId,
            fields: {
              notes: 'Must roll back',
              affectedSources: [
                { kind: 'journey', id: identity.journeyId },
                { kind: 'journey', id: identity.journeyId + 1 },
              ],
            },
          },
          'Invalid source'
        )
      ).toBe(false);
      expect(await loadDecision(props)).toEqual(restored);
      expect(
        await editor.commit(
          { kind: 'edit-option', id: identity.optionId, fields: { notes: 'Own confirmed note' } },
          'Edit notes'
        )
      ).toBe(true);
      unwrap(
        await decisionOptionsUpdate({
          client: props.client,
          path: { tripId: identity.tripId, decisionId: identity.decisionId, id: identity.optionId },
          body: { expectedRevision: 4, notes: 'Concurrent writer note' },
        })
      );
      expect(await editor.undo()).toBe(false);
      expect(editor.getState()).toMatchObject({ undoCount: 0, conflict: true });
      expect(await loadDecision(props)).toMatchObject({
        decision: { revision: 5 },
        options: [
          {
            notes: 'Concurrent writer note',
            affectedSources: [{ kind: 'journey', id: identity.journeyId }],
          },
        ],
      });
    } finally {
      lines.close();
      if (child.exitCode === null && child.signalCode === null) {
        const exited = once(child, 'exit');
        child.kill('SIGTERM');
        await exited;
      }
    }
  }
);
