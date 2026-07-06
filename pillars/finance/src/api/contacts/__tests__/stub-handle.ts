/**
 * Shared stub-`PillarHandle<ContactsRouter>` builders for driving the REAL
 * `createContactsClient` in tests without a network — used by both the
 * client's own unit tests and any integration test that needs the real
 * TRANSIENT/PERMANENT error classification `createOrFetchByName` applies to
 * a `CallResult`, not a hand-rolled fake that can't reproduce it.
 */
import {
  type CallDynamicFn,
  type CallResult,
  type CallableProcedure,
  type PillarHandle,
} from '@pops/pillar-sdk/client';

import type { ContactEntity, ContactsRouter, ListResponse } from '../client.js';

export function ok<T>(value: T): CallResult<T> {
  return { kind: 'ok', value };
}

export function conflict<T>(message: string): CallResult<T> {
  return { kind: 'conflict', pillar: 'contacts', message };
}

export function proc<Args extends readonly unknown[], Output>(
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
  throw new Error('callDynamic is not used by the contacts client');
};

export interface StubImpls {
  list: (input: {
    search?: string;
    type?: string;
    limit?: number;
    offset?: number;
  }) => Promise<CallResult<ListResponse>>;
  get?: (input: { id: string }) => Promise<CallResult<{ data: ContactEntity }>>;
  create?: (input: {
    name: string;
    type: string;
  }) => Promise<CallResult<{ data: ContactEntity; message: string }>>;
}

export function unexpected(name: string): never {
  throw new Error(`stub ${name} called unexpectedly`);
}

export function stubHandle(impls: StubImpls): PillarHandle<ContactsRouter> {
  return {
    entities: {
      list: proc(impls.list),
      get: proc(impls.get ?? (() => unexpected('entities.get'))),
      create: proc(impls.create ?? (() => unexpected('entities.create'))),
    },
    callDynamic,
  };
}

export function entity(over: Partial<ContactEntity> & { id: string; name: string }): ContactEntity {
  return {
    type: 'company',
    abn: null,
    aliases: [],
    defaultTransactionType: null,
    defaultTags: [],
    notes: null,
    lastEditedTime: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

export function page(
  data: ContactEntity[],
  hasMore: boolean,
  offset = 0
): CallResult<ListResponse> {
  return ok({ data, pagination: { total: data.length, limit: 200, offset, hasMore } });
}
