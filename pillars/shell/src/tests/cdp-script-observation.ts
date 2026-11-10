import { z } from 'zod';

import { ScriptSession } from './cdp-script-session';

import type { ObservedScript } from './cdp-script-types';

const targetSchema = z.object({
  targetId: z.string(),
  type: z.string(),
  browserContextId: z.string().optional(),
});
const attachmentSchema = z.object({
  sessionId: z.string(),
  waitingForDebugger: z.boolean(),
  targetInfo: targetSchema,
});

interface PageState {
  readonly contextId: string | undefined;
  readonly listeners: Set<() => void>;
  readonly errors: Error[];
}

/** Dedicated-worker identity supplied by the actual parent's Target attachment event. */
export interface AttachedWorker {
  readonly sessionId: string;
  readonly waitingForDebugger: boolean;
}

/** A page-bound view of pending scripts and observation errors, independent of other contexts. */
export interface PageScriptObservation {
  readonly pending: () => readonly ObservedScript[];
  readonly assertHealthy: () => void;
  readonly dispose: () => void;
}

/**
 * Own protocol lifetimes by explicit target/session lineage. Page/context bindings
 * come from public Target metadata; neither URLs nor asynchronously sampled documents identify owners.
 */
export class ScriptObservations {
  private readonly sessions = new Map<string, ScriptSession>();
  private readonly pages = new Map<string, PageState>();
  private readonly globalErrors: Error[] = [];

  /** Record the parent relationship before Playwright receives an attachment and can resume it. */
  attached(parentSessionId: string | undefined, params: unknown): AttachedWorker | undefined {
    const attached = attachmentSchema.parse(params);
    const target = attached.targetInfo;
    if (target.type === 'page') {
      const current = this.pages.get(target.targetId);
      if (current && current.contextId !== target.browserContextId)
        throw new Error('Page target changed browser context');
      if (!current)
        this.pages.set(target.targetId, {
          contextId: target.browserContextId,
          listeners: new Set(),
          errors: [],
        });
      this.sessions.set(
        attached.sessionId,
        new ScriptSession(attached.sessionId, target.targetId, 'page', {
          pageTargetId: target.targetId,
          parentSessionId,
        })
      );
      return undefined;
    }
    if (target.type !== 'iframe' && target.type !== 'worker') return undefined;
    const parent = parentSessionId === undefined ? undefined : this.sessions.get(parentSessionId);
    if (!parent) throw new Error('Attached frame or worker has no observed parent session');
    this.sessions.set(
      attached.sessionId,
      new ScriptSession(attached.sessionId, target.targetId, target.type, {
        pageTargetId: parent.owner.pageTargetId,
        parentSessionId,
      })
    );
    return target.type === 'worker'
      ? { sessionId: attached.sessionId, waitingForDebugger: attached.waitingForDebugger }
      : undefined;
  }

  /** Bind a public page target/context proof to a scoped listener and immutable pending projection. */
  observe(targetInfo: unknown, changed: () => void): PageScriptObservation {
    const target = targetSchema.parse(targetInfo);
    const page = this.pages.get(target.targetId);
    if (target.type !== 'page' || !page || page.contextId !== target.browserContextId)
      throw new Error('Page is not owned by this browser observation');
    page.listeners.add(changed);
    return {
      pending: () =>
        [...this.sessions.values()]
          .filter((session) => session.owner.pageTargetId === target.targetId)
          .flatMap((session) => session.pending()),
      assertHealthy: () => {
        const errors = [...this.globalErrors, ...page.errors];
        if (errors.length > 0)
          throw new AggregateError(errors, 'Browser script observation failed');
      },
      dispose: () => page.listeners.delete(changed),
    };
  }

  /** Initialise a page session from its own actual frame-tree reply. */
  frameTree(sessionId: string | undefined, result: unknown): void {
    const session = sessionId === undefined ? undefined : this.sessions.get(sessionId);
    if (session?.frameTree(result)) this.changed(session.owner.pageTargetId);
  }

  /** Preserve exact script terminals and settle only a known worker's own bootstrap. */
  received(sessionId: string | undefined, method: string, params: unknown): void {
    const session = sessionId === undefined ? undefined : this.sessions.get(sessionId);
    if (!session) return;
    let changed = session.received(method, params);
    if (session.kind === 'worker') {
      let bootstrap = method === 'Inspector.workerScriptLoaded';
      if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
        bootstrap =
          z.object({ requestId: z.string() }).parse(params).requestId === session.targetId;
      }
      if (bootstrap && session.owner.parentSessionId !== undefined) {
        changed =
          (this.sessions.get(session.owner.parentSessionId)?.settled(session.targetId) ?? false) ||
          changed;
      }
    }
    if (changed) this.changed(session.owner.pageTargetId);
  }

  /** A lost worker session cannot claim that its unfinished requests completed. */
  detached(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;
    if (session.pending().length > 0)
      this.failed(sessionId, new Error('Script session detached with unfinished requests'));
    if (session.kind !== 'page' || this.pages.get(session.owner.pageTargetId)?.listeners.size !== 0)
      return;
    for (const [id, owned] of this.sessions)
      if (owned.owner.pageTargetId === session.owner.pageTargetId) this.sessions.delete(id);
    this.pages.delete(session.owner.pageTargetId);
  }

  /** Route a known-session failure only to its page; transport failures affect every page. */
  failed(sessionId: string | undefined, error: Error): void {
    const session = sessionId === undefined ? undefined : this.sessions.get(sessionId);
    const page = session === undefined ? undefined : this.pages.get(session.owner.pageTargetId);
    if (page && session) {
      page.errors.push(error);
      this.changed(session.owner.pageTargetId);
    } else {
      this.globalErrors.push(error);
      for (const state of this.pages.values()) for (const listener of state.listeners) listener();
    }
  }

  /** Report fatal setup/transport failures even when no test page could be created. */
  assertHealthy(): void {
    if (this.globalErrors.length > 0)
      throw new AggregateError(this.globalErrors, 'Browser script observation failed');
  }

  private changed(targetId: string): void {
    for (const listener of this.pages.get(targetId)?.listeners ?? []) listener();
  }
}
