/**
 * A hand-built stub `PillarHandle<AiRouter>`, mirroring
 * `pillars/finance/src/api/contacts/__tests__/stub-handle.ts` — drives the
 * REAL {@link createAiClient} in tests without a network.
 */
import {
  type CallDynamicFn,
  type CallResult,
  type CallableProcedure,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import type { AiRouter } from '../client.js';

export function ok<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

export function unauthorized<T>(message: string): CallResult<T> {
  return { kind: 'unauthorized', pillar: 'ai', message };
}

export function unavailable<T>(): CallResult<T> {
  return { kind: 'unavailable', pillar: 'ai' };
}

function proc<Args extends readonly unknown[], Output>(
  fn: (...args: Args) => Promise<CallResult<Output>>
): CallableProcedure<Args, Output> {
  const orThrow = async (...args: Args): Promise<Output> => {
    const result = await fn(...args);
    if (result.kind !== 'ok') throw new Error(`stub orThrow: ${result.kind}`);
    return result.value;
  };
  return Object.assign(fn, { orThrow });
}

const callDynamic: CallDynamicFn = () => {
  throw new Error('callDynamic is not used by the ai client');
};

export function stubAiHandle(
  rank: (input: {
    name: string;
    typeKey?: string;
    candidates: string[];
  }) => Promise<CallResult<{ data: { ranked: string[] } }>>
): PillarHandle<AiRouter> {
  return {
    codes: { rank: proc(rank) },
    callDynamic,
  };
}
