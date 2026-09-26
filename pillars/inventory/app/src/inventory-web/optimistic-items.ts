import { highestCachedItem, isWebItemQuery, replaceCachedItem } from './optimistic-item-cache.js';

import type { QueryClient } from '@tanstack/react-query';

import type { WebItem } from './item-row-model.js';

/** A pure transformation applied to one cached web item. */
export type ItemPatch = (item: WebItem) => WebItem;

type Waiter = { readonly tokens: Set<number>; readonly resolve: () => void };
type ItemLedger = Record<'acknowledged' | 'displayed', WebItem> & {
  pending: Map<number, ItemPatch>;
  waiters: Waiter[];
};

const applyPatches = (item: WebItem, patches: Iterable<ItemPatch>): WebItem =>
  [...patches].reduce((result, patch) => patch(result), item);

class QueryClientOptimisticItems {
  private readonly ledgers = new Map<string, ItemLedger>();
  private readonly listeners = new Set<() => void>();
  private pendingSnapshot: ReadonlySet<string> = new Set();
  private nextToken = 1;
  private readonly invalidationHolds = new Set<symbol>();
  private invalidationOwed = false;
  private applying = false;

  constructor(private readonly queryClient: QueryClient) {
    queryClient
      .getQueryCache()
      .subscribe(() => !this.applying && [...this.ledgers.keys()].forEach((id) => this.rebase(id)));
  }

  displayed = (id: string): WebItem => {
    const item = this.ledgers.get(id)?.displayed ?? highestCachedItem(this.queryClient, id);
    if (item === undefined) throw new Error(`item ${id} is not loaded`);
    return item;
  };

  baseRevision = (id: string): number =>
    this.ledgers.get(id)?.acknowledged.revision ?? this.displayed(id).revision;

  begin = (id: string, patch: ItemPatch): number => {
    const ledger = this.ledgers.get(id) ?? this.createLedger(id);
    if (ledger.pending.size > 0) this.rebase(id);
    const token = this.nextToken++;
    ledger.pending.set(token, patch);
    ledger.displayed = applyPatches(ledger.acknowledged, ledger.pending.values());
    this.updatePendingSnapshot();
    this.writeDisplayed(id);
    return token;
  };

  acknowledge = (id: string, token: number, applied: { revision: number; seq: number }): void => {
    const ledger = this.ledgers.get(id);
    const patch = ledger?.pending.get(token);
    if (ledger === undefined || patch === undefined) return;
    ledger.acknowledged = { ...patch(ledger.acknowledged), ...applied };
    ledger.pending.delete(token);
    this.settleWaiters(ledger, token);
    this.completeOrContinue(id, ledger);
  };

  refuse = (id: string, token: number): void => {
    const ledger = this.ledgers.get(id);
    if (ledger === undefined || !ledger.pending.delete(token)) return;
    this.settleWaiters(ledger, token);
    this.completeOrContinue(id, ledger);
  };

  settled = (id: string): Promise<void> => {
    const ledger = this.ledgers.get(id);
    if (ledger === undefined || ledger.pending.size === 0) return Promise.resolve();
    const tokens = new Set(ledger.pending.keys());
    return new Promise((resolve) => ledger.waiters.push({ tokens, resolve }));
  };

  holdInvalidation = (): (() => void) => {
    const hold = Symbol();
    this.invalidationHolds.add(hold);
    return () => {
      if (
        this.invalidationHolds.delete(hold) &&
        this.invalidationHolds.size === 0 &&
        this.invalidationOwed
      ) {
        this.invalidationOwed = false;
        this.requestInvalidation();
      }
    };
  };

  pendingIds = (): ReadonlySet<string> => this.pendingSnapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private createLedger(id: string): ItemLedger {
    const item = highestCachedItem(this.queryClient, id);
    if (item === undefined) throw new Error(`item ${id} is not loaded`);
    const ledger = Object.assign(
      { acknowledged: item, displayed: item },
      { pending: new Map<number, ItemPatch>(), waiters: new Array<Waiter>() }
    );
    this.ledgers.set(id, ledger);
    return ledger;
  }

  private rebase(id: string): void {
    const ledger = this.ledgers.get(id);
    if (ledger === undefined) return;
    const newest = highestCachedItem(this.queryClient, id);
    if (newest !== undefined && newest.revision > ledger.acknowledged.revision) {
      ledger.acknowledged = newest;
      ledger.displayed = applyPatches(newest, ledger.pending.values());
    }
    this.writeDisplayed(id);
  }

  private completeOrContinue(id: string, ledger: ItemLedger): void {
    const pending = ledger.pending.size > 0;
    ledger.displayed = pending
      ? applyPatches(ledger.acknowledged, ledger.pending.values())
      : ledger.acknowledged;
    this.writeDisplayed(id);
    if (pending) return;
    this.ledgers.delete(id);
    this.updatePendingSnapshot();
    this.requestInvalidation();
  }

  private settleWaiters(ledger: ItemLedger, token: number): void {
    ledger.waiters = ledger.waiters.filter((waiter) => {
      if (!waiter.tokens.delete(token) || waiter.tokens.size > 0) return true;
      waiter.resolve();
      return false;
    });
  }

  private updatePendingSnapshot(): void {
    const next = new Set(
      [...this.ledgers].filter(([, ledger]) => ledger.pending.size > 0).map(([id]) => id)
    );
    if (
      next.size === this.pendingSnapshot.size &&
      [...next].every((id) => this.pendingSnapshot.has(id))
    )
      return;
    this.pendingSnapshot = next;
    this.listeners.forEach((listener) => listener());
  }

  private writeDisplayed(id: string): void {
    const ledger = this.ledgers.get(id);
    if (ledger === undefined) return;
    this.applying = true;
    try {
      this.queryClient.setQueriesData(
        { predicate: (query) => isWebItemQuery(query.queryKey) },
        (data: unknown) => replaceCachedItem(data, id, ledger.displayed)
      );
    } finally {
      this.applying = false;
    }
  }

  private requestInvalidation(): void {
    if (this.invalidationHolds.size > 0) this.invalidationOwed = true;
    else void this.queryClient.invalidateQueries({ queryKey: ['inventory', 'web'] });
  }
}

type PublicMethods<T> = {
  [K in keyof T as T[K] extends (...args: never[]) => unknown ? K : never]: T[K];
};

/** Coordinates optimistic copies, acknowledgements, refetch rebases, and invalidation. */
export type OptimisticItems = PublicMethods<QueryClientOptimisticItems>;

const optimisticItemsByClient = new WeakMap<QueryClient, OptimisticItems>();

/** Returns the optimistic item ledger associated with `queryClient`. */
export function optimisticItemsFor(queryClient: QueryClient): OptimisticItems {
  const existing = optimisticItemsByClient.get(queryClient);
  if (existing !== undefined) return existing;
  const created = new QueryClientOptimisticItems(queryClient);
  optimisticItemsByClient.set(queryClient, created);
  return created;
}
