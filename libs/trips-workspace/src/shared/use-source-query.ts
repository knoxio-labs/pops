import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import {
  assertSourceOwner,
  isSourceOwnerCurrent,
  sourceOwnerProblem,
  RetainedSessionStore,
} from './retained-session-store';
import { useRetainedSession } from './use-retained-session';

import type { QueryKey, UseQueryResult } from '@tanstack/react-query';

import type { ApiError } from '@pops/pillar-sdk/client';

import type { RetainedSourceIdentity, RetainedSourceOwner } from './retained-session-store';

/** The original query cancellation signal stays lazy until the owning loader explicitly consumes it. */
export interface SourceReadContext {
  readonly signal: AbortSignal;
}

/** The owning source supplies its existing cache key and read operation at the captured transport boundary. */
export interface SourceRead<Value> {
  queryKey: QueryKey;
  /** Dispatch against the supplied owner; recheck it after any asynchronous preparation before a later dispatch. */
  load: (context: SourceReadContext) => Promise<Value>;
}

/** Query result and immutable owner remain paired even while the client's live configuration changes. */
export type SourceQuery<Value> = UseQueryResult<Value, Error> & {
  owner: RetainedSourceOwner;
  queryKey: QueryKey;
  ownershipError: ApiError | undefined;
};

interface ReadBinding<Value> extends SourceRead<Value> {
  owner: RetainedSourceOwner;
}
const owners = new RetainedSessionStore<undefined>();

/** Pin cache identity and read transport per view; a changed origin cannot dispatch into the previous origin's key. */
export function useSourceQuery<Value>(
  identity: RetainedSourceIdentity,
  create: (owner: RetainedSourceOwner) => SourceRead<Value>,
  options?: { enabled?: boolean }
): SourceQuery<Value> {
  const { owner } = useRetainedSession(owners, identity, () => undefined);
  const bind = (): ReadBinding<Value> => ({ owner, ...create(owner) });
  const [stored, setStored] = useState(bind);
  let binding = stored;
  if (binding.owner !== owner) {
    binding = bind();
    setStored(binding);
  }
  const query = useQuery<Value, Error>({
    enabled: options?.enabled,
    queryKey: binding.queryKey,
    queryFn: (context) => {
      assertSourceOwner(binding.owner);
      return binding.load(context);
    },
    retry: false,
  });
  return {
    ...query,
    owner,
    queryKey: binding.queryKey,
    ownershipError: isSourceOwnerCurrent(owner) ? undefined : sourceOwnerProblem(),
  };
}
