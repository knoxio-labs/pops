import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline';

import { expect, it } from 'vitest';

import {
  PeopleEditor,
  applyMeetingOperation,
  loadMeetingPlans,
} from '@pops/trips-workspace/people-client';

import { createClient } from '../trips-api/client';

async function producer() {
  const child = spawn(
    process.execPath,
    ['--import', 'tsx', resolve('../src/api/__tests__/meeting-source.fixture.ts')],
    { stdio: ['ignore', 'pipe', 'inherit'] }
  );
  const lines = createInterface({ input: child.stdout });
  const ready = Promise.race([
    once(lines, 'line'),
    once(child, 'exit').then(() => {
      throw new Error('Meeting producer exited before ready');
    }),
  ]);
  try {
    const [line] = await ready;
    const identity: unknown = JSON.parse(String(line));
    if (
      typeof identity !== 'object' ||
      identity === null ||
      !('origin' in identity) ||
      typeof identity.origin !== 'string' ||
      !('tripId' in identity) ||
      typeof identity.tripId !== 'number'
    )
      throw new Error('Invalid meeting fixture identity');
    return {
      origin: identity.origin,
      tripId: identity.tripId,
      close: async () => {
        lines.close();
        child.kill('SIGTERM');
        await once(child, 'exit');
      },
    };
  } catch (error) {
    lines.close();
    child.kill('SIGTERM');
    throw error;
  }
}

it(
  'replays an uncertain create once and restores independent meeting facts with confirmed own Undo over generated HTTP and SQLite',
  { timeout: 60_000 },
  async () => {
    const source = await producer();
    try {
      let loseResponse = true;
      const transport: typeof globalThis.fetch = async (input, init) => {
        const request = new Request(input, init);
        const response = await globalThis.fetch(request);
        if (request.method === 'POST' && loseResponse) {
          loseResponse = false;
          throw new Error('Response lost after persisted create');
        }
        return response;
      };
      const props = {
        tripId: source.tripId,
        client: createClient({
          baseUrl: source.origin,
          headers: { 'x-api-key': 'meeting' },
          fetch: transport,
        }),
      };
      const editor = new PeopleEditor(await loadMeetingPlans(props), (operation) =>
        applyMeetingOperation(props, operation)
      );
      await editor.run({
        kind: 'create',
        input: {
          contactUri: 'pops:contacts/contact/historical',
          startDate: null,
          endDate: '2030-01-01',
        },
      });
      expect(editor.snapshot().failure).not.toBeNull();
      expect(await loadMeetingPlans(props)).toHaveLength(1);
      await editor.retry();
      const created = editor.snapshot().plans[0];
      if (!created) throw new Error('Missing confirmed source');
      expect(created.contactUri).toBe('pops:contacts/contact/canonical');
      await editor.run({
        kind: 'update',
        id: created.id,
        expectedRevision: created.revision,
        patch: { intention: 'Planned', startDate: '2030-02-01' },
      });
      const changed = editor.snapshot().plans[0];
      if (!changed) throw new Error('Missing edited source');
      expect(changed).toMatchObject({
        agreement: 'Not agreed',
        startDate: '2030-02-01',
        endDate: '2030-01-01',
      });
      await editor.run({ kind: 'remove', id: changed.id, expectedRevision: changed.revision });
      expect(await loadMeetingPlans(props)).toEqual([]);
      await editor.undo();
      expect(await loadMeetingPlans(props)).toMatchObject([
        { id: created.id, intention: 'Planned', revision: 4 },
      ]);
      await editor.undo();
      expect(await loadMeetingPlans(props)).toMatchObject([
        {
          id: created.id,
          intention: 'Considering',
          startDate: null,
          endDate: '2030-01-01',
          revision: 5,
        },
      ]);
      await editor.undo();
      expect(await loadMeetingPlans(props)).toEqual([]);
      expect(editor.snapshot().failure).toBeNull();
    } finally {
      await source.close();
    }
  }
);
