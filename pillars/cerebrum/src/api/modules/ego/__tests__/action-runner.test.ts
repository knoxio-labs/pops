import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { executeConfirmedActions, type ActionRunEvent } from '../action-runner.js';
import { INTERRUPTED_RESULT, DECLINED_RESULT } from '../loop-resume.js';
import {
  collectRun,
  createRunnerFixture,
  fakeGateway,
  TEST_ACTIONS,
  type RunnerFixture,
} from './action-runner-test-utils.js';

let fixture: RunnerFixture;

beforeEach(() => {
  fixture = createRunnerFixture();
});

afterEach(() => {
  fixture.close();
});

function replaceFixture(options: Parameters<typeof createRunnerFixture>[0]): void {
  fixture.close();
  fixture = createRunnerFixture(options);
}

function run(
  gateway: Parameters<typeof executeConfirmedActions>[0]['gateway'],
  batchId = fixture.batchId
) {
  return executeConfirmedActions({ ...fixture, gateway, batchId });
}

function toolEvents(events: ActionRunEvent[]) {
  return events.filter((event) => event.type === 'tool');
}

function partStatuses(events: ActionRunEvent[]): string[][] {
  return events
    .filter((event) => event.type === 'part')
    .map((event) => event.part.actions.map(({ status }) => status));
}

describe('executeConfirmedActions', () => {
  it('runs confirmed actions in order and syncs each part before completion events', async () => {
    const { gateway, calls } = fakeGateway();
    const result = await collectRun(run(gateway));

    expect(calls).toEqual(TEST_ACTIONS.map(({ tool: name, args }) => ({ name, args })));
    expect(toolEvents(result.events)).toEqual(
      TEST_ACTIONS.flatMap(({ tool }) => [
        { type: 'tool', name: tool, status: 'started' },
        { type: 'tool', name: tool, status: 'finished' },
      ])
    );
    expect(partStatuses(result.events)).toEqual([
      ['executed', 'confirmed', 'confirmed'],
      ['executed', 'executed', 'confirmed'],
      ['executed', 'executed', 'executed'],
    ]);
    expect(
      fixture.store.listForBatch(fixture.batchId).map(({ status, result: text }) => [status, text])
    ).toEqual(TEST_ACTIONS.map(({ tool }) => ['executed', `Result for ${tool}`]));
    expect(result.resolutions.get('action-1')).toEqual({
      content: `Result for ${TEST_ACTIONS[0].tool}`,
      isError: false,
    });
    expect(fixture.readMessage()?.parts).toEqual([
      {
        type: 'actions',
        batchId: fixture.batchId,
        actions: TEST_ACTIONS.map(({ id, tool }, i) => ({
          actionId: id,
          tool,
          summary: `Summary ${i + 1}`,
          status: 'executed',
        })),
      },
    ]);
  });

  it('skips rejected actions and returns their declined result', async () => {
    replaceFixture({ statuses: ['confirmed', 'rejected', 'confirmed'] });
    const { gateway, calls } = fakeGateway();
    const result = await collectRun(run(gateway));

    expect(calls.map(({ name }) => name)).toEqual([TEST_ACTIONS[0].tool, TEST_ACTIONS[2].tool]);
    expect(toolEvents(result.events)).toHaveLength(4);
    expect(partStatuses(result.events)).toEqual([
      ['executed', 'rejected', 'confirmed'],
      ['executed', 'rejected', 'executed'],
    ]);
    expect(result.resolutions.get('action-2')).toEqual({
      content: DECLINED_RESULT,
      isError: false,
    });
  });

  it('continues after error results and rejected gateway calls', async () => {
    const { gateway, calls } = fakeGateway([
      { text: 'Created.', isError: false },
      { text: 'Rejected by the gateway.', isError: true },
      new Error('Connection failed.'),
    ]);
    const result = await collectRun(run(gateway));

    expect(calls.map(({ name }) => name)).toEqual(TEST_ACTIONS.map(({ tool }) => tool));
    expect(
      toolEvents(result.events)
        .filter(({ status }) => status !== 'started')
        .map(({ status }) => status)
    ).toEqual(['finished', 'failed', 'failed']);
    expect(
      fixture.store.listForBatch(fixture.batchId).map(({ status, result: text }) => [status, text])
    ).toEqual([
      ['executed', 'Created.'],
      ['failed', 'Rejected by the gateway.'],
      ['failed', 'Connection failed.'],
    ]);
    expect(result.resolutions.get('action-3')).toEqual({
      content: 'Connection failed.',
      isError: true,
    });
  });

  it('fails pending actions as interrupted without calling their tools', async () => {
    replaceFixture({ statuses: ['pending', 'confirmed', 'confirmed'] });
    const { gateway, calls } = fakeGateway();
    const result = await collectRun(run(gateway));

    expect(calls.map(({ name }) => name)).toEqual(TEST_ACTIONS.slice(1).map(({ tool }) => tool));
    expect(fixture.store.get('action-1')).toMatchObject({
      status: 'failed',
      result: INTERRUPTED_RESULT,
    });
    expect(partStatuses(result.events)[0]).toEqual(['failed', 'confirmed', 'confirmed']);
    expect(result.resolutions.get('action-1')).toEqual({
      content: INTERRUPTED_RESULT,
      isError: true,
    });
  });

  it('rechecks each confirmed action before running it', async () => {
    const { gateway, calls } = fakeGateway();
    const iterator = run(gateway);
    await iterator.next();
    await iterator.next();
    await iterator.next();
    expect(fixture.store.transition('action-2', 'confirmed', 'failed', 'Settled elsewhere.')).toBe(
      true
    );

    const rest = await collectRun(iterator);
    expect(calls.map(({ name }) => name)).toEqual([TEST_ACTIONS[0].tool, TEST_ACTIONS[2].tool]);
    expect(toolEvents(rest.events).map(({ name }) => name)).toEqual([
      TEST_ACTIONS[2].tool,
      TEST_ACTIONS[2].tool,
    ]);
  });

  it('persists the action card before yielding the finished tool frame', async () => {
    const { gateway, calls } = fakeGateway();
    const iterator = run(gateway);
    await iterator.next();
    const finished = await iterator.next();
    expect(finished.value).toEqual({
      type: 'tool',
      name: TEST_ACTIONS[0].tool,
      status: 'finished',
    });
    await iterator.return(new Map());

    expect(calls).toHaveLength(1);
    expect(fixture.readMessage()?.parts?.[0]).toMatchObject({
      type: 'actions',
      actions: [
        { actionId: 'action-1', status: 'executed' },
        { actionId: 'action-2', status: 'confirmed' },
        { actionId: 'action-3', status: 'confirmed' },
      ],
    });
  });

  it('does not run resolved actions a second time', async () => {
    const { gateway, calls } = fakeGateway();
    await collectRun(run(gateway));
    const replay = await collectRun(run(gateway));

    expect(replay.events).toEqual([]);
    expect(calls).toHaveLength(3);
  });
});
