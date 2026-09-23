import type { CallResult } from '@pops/pillar-sdk/server';

/** Empty, fully drained inventory snapshot used by the BFM gateway fake. */
export function emptyInventorySnapshot(): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      epoch: 'epoch-1',
      highWaterSeq: 0,
      minimumProtocol: 2,
      catalogueVersion: 'cat-1',
      total: 0,
      items: [],
      locations: [],
      nextCursor: null,
    },
  };
}

/** Empty, fully drained inventory change page used by the BFM gateway fake. */
export function emptyInventoryChanges(): CallResult<unknown> {
  return {
    kind: 'ok',
    value: {
      epoch: 'epoch-1',
      minimumProtocol: 2,
      items: [],
      locations: [],
      events: [],
      nextSince: 0,
      hasMore: false,
      catalogueVersion: 'cat-1',
    },
  };
}
