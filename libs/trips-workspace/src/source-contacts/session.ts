import { client as defaultTripsClient } from '../trips-api/client.gen';

import type { QueryClient } from '@tanstack/react-query';

import type {
  ContactChooserIntent,
  ContactChooserSelection,
  ContactsHostCapability,
} from '@pops/pillar-sdk';

import type { Client } from '../trips-api/client';

/** Explicit owning source field; its meaning comes from the caller's published source contract. */
export interface SourceContactContext {
  sourceKey: readonly [number, string, number, string];
  client?: Client;
  contacts?: ContactsHostCapability;
}
/** One retained owner operation, including unresolved creation after its view closes. */
export interface SourceContactAttempt {
  chooser: ContactChooserIntent;
  selected?: ContactChooserSelection;
}
/** Retain owner intent and issued references independently of subsequent Trips writes and query eviction. */
export class SourceContactSession {
  readonly id = crypto.randomUUID();
  readonly receipts: ContactChooserSelection[] = [];
  private readonly attempts = new Map<string, SourceContactAttempt>();
  private readonly origin: string;
  private version = 0;
  private readonly listeners = new Set<() => void>();

  constructor(readonly context: SourceContactContext) {
    this.origin = sourceOrigin(context);
  }

  /** Observe issued references retained by another view or a late closed-view callback. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  /** Stable external-store revision; owner receipt storage remains outside the query cache. */
  readonly snapshot = (): number => this.version;

  /** Fence source writes if a mutable generated transport changes origin after the view rendered. */
  isCurrent(): boolean {
    return this.origin === sourceOrigin(this.context);
  }

  /** Resume an unresolved owner operation; only a known selection permits a fresh explicit choice. */
  open(key: string): SourceContactAttempt | undefined {
    if (!this.context.contacts || !this.isCurrent()) return undefined;
    let attempt = this.attempts.get(key);
    if (!attempt || attempt.selected) {
      attempt = { chooser: this.context.contacts.createIntent() };
      this.attempts.set(key, attempt);
    }
    return attempt;
  }

  /** Preserve actual owner evidence even if the source view closed or its subsequent write failed. */
  accept(attempt: SourceContactAttempt, selection: ContactChooserSelection): boolean {
    if (attempt.selected) return false;
    const retained = { name: selection.name, reference: { ...selection.reference } };
    attempt.selected = retained;
    this.receipts.push(retained);
    this.version += 1;
    for (const listener of this.listeners) listener();
    return true;
  }
}
interface RetainedContactSession {
  key: string;
  session: SourceContactSession;
}
const sessions = new WeakMap<QueryClient, RetainedContactSession[]>();

/** Shell mount-lifetime storage; exact source, capability, client and origin changes isolate owner intents. */
export function sourceContactSession(
  scope: QueryClient,
  context: SourceContactContext
): SourceContactSession {
  let entries = sessions.get(scope);
  if (!entries) {
    entries = [];
    sessions.set(scope, entries);
  }
  const key = JSON.stringify([
    context.sourceKey,
    (context.client ?? defaultTripsClient).getConfig().baseUrl ?? '',
  ]);
  const existing = entries.find(
    (entry) =>
      entry.key === key &&
      entry.session.context.client === context.client &&
      entry.session.context.contacts === context.contacts
  );
  if (existing) return existing.session;
  const session = new SourceContactSession({ ...context, sourceKey: [...context.sourceKey] });
  entries.push({ key, session });
  return session;
}

function sourceOrigin(context: SourceContactContext): string {
  return (context.client ?? defaultTripsClient).getConfig().baseUrl ?? '';
}
