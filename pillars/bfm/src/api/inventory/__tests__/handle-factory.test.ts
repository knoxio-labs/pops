import { describe, expect, it, vi } from 'vitest';

type ExtraHeadersFn = () => Record<string, string> | Promise<Record<string, string>>;

const capturedOptions: { extraHeaders?: ExtraHeadersFn }[] = [];

vi.mock('@pops/pillar-sdk/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@pops/pillar-sdk/server')>();
  return {
    ...actual,
    pillar: (_pillarId: string, options?: { extraHeaders?: ExtraHeadersFn }) => {
      capturedOptions.push(options ?? {});
      return {};
    },
  };
});

const {
  createInventoryPillarHandleFactory,
  INVENTORY_ACTOR_HEADER,
  INVENTORY_PROTOCOL_HEADER,
  INVENTORY_SYNC_PROTOCOL_VERSION,
  withInventoryActor,
} = await import('../handle-factory.js');

describe('createInventoryPillarHandleFactory', () => {
  it('always sends this build sync protocol, with no actor header outside a mutation call', async () => {
    const factory = createInventoryPillarHandleFactory();
    factory('inventory');

    const options = capturedOptions.at(-1);
    const headers = await options?.extraHeaders?.();

    expect(headers).toEqual({
      [INVENTORY_PROTOCOL_HEADER]: String(INVENTORY_SYNC_PROTOCOL_VERSION),
    });
  });

  it('adds Pops-Actor only for the duration of withInventoryActor', async () => {
    const factory = createInventoryPillarHandleFactory();

    const headersInsideRun = await withInventoryActor('device:d1;label=Test', async () => {
      factory('inventory');
      const options = capturedOptions.at(-1);
      return options?.extraHeaders?.();
    });

    expect(headersInsideRun).toEqual({
      [INVENTORY_PROTOCOL_HEADER]: String(INVENTORY_SYNC_PROTOCOL_VERSION),
      [INVENTORY_ACTOR_HEADER]: 'device:d1;label=Test',
    });

    factory('inventory');
    const headersAfterRun = await capturedOptions.at(-1)?.extraHeaders?.();
    expect(headersAfterRun).toEqual({
      [INVENTORY_PROTOCOL_HEADER]: String(INVENTORY_SYNC_PROTOCOL_VERSION),
    });
  });

  it('keeps two concurrent actors apart', async () => {
    const factory = createInventoryPillarHandleFactory();

    const [a, b] = await Promise.all([
      withInventoryActor('device:a;label=A', async () => {
        factory('inventory');
        return capturedOptions.at(-1)?.extraHeaders?.();
      }),
      withInventoryActor('device:b;label=B', async () => {
        factory('inventory');
        return capturedOptions.at(-1)?.extraHeaders?.();
      }),
    ]);

    expect([a, b]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ [INVENTORY_ACTOR_HEADER]: 'device:a;label=A' }),
        expect.objectContaining({ [INVENTORY_ACTOR_HEADER]: 'device:b;label=B' }),
      ])
    );
  });
});
