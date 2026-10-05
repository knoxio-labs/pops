import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { executeConfirmedActions, unavailableGateway } from '../action-runner.js';
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
  vi.restoreAllMocks();
  fixture.close();
});

function run(
  gateway: Parameters<typeof executeConfirmedActions>[0]['gateway'],
  batchId = fixture.batchId
) {
  return executeConfirmedActions({ ...fixture, gateway, batchId });
}

describe('executeConfirmedActions edge cases', () => {
  it('stores at most 4000 result characters', async () => {
    const { gateway } = fakeGateway([{ text: 'x'.repeat(4001), isError: false }]);
    const result = await collectRun(run(gateway));

    expect(fixture.store.get('action-1')?.result).toHaveLength(4000);
    expect(result.resolutions.get('action-1')?.content).toHaveLength(4000);
  });

  it('still records outcomes when the message has no actions part', async () => {
    fixture.close();
    fixture = createRunnerFixture({ withActionsPart: false });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { gateway, calls } = fakeGateway();
    const result = await collectRun(run(gateway));

    expect(calls).toHaveLength(3);
    expect(result.events.some((event) => event.type === 'part')).toBe(false);
    expect(
      fixture.store.listForBatch(fixture.batchId).every(({ status }) => status === 'executed')
    ).toBe(true);
    expect(warn).toHaveBeenCalled();
  });

  it('uses unavailableGateway to fail every confirmed action safely', async () => {
    const result = await collectRun(run(unavailableGateway));

    expect(
      fixture.store.listForBatch(fixture.batchId).map(({ status, result: text }) => [status, text])
    ).toEqual(TEST_ACTIONS.map(() => ['failed', 'The tool gateway is not configured.']));
    expect(result.resolutions.get('action-1')).toEqual({
      content: 'The tool gateway is not configured.',
      isError: true,
    });
  });

  it('throws when the requested batch is missing', async () => {
    const { gateway } = fakeGateway();
    await expect(collectRun(run(gateway, 'missing-batch'))).rejects.toThrow(
      'Ego action batch missing-batch does not exist'
    );
  });
});
