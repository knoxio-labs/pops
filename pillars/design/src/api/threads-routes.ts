/**
 * The four thread routes. Each one resolves its principal first: a request
 * that reached here without Access vouching for it gets a 403 and touches no
 * table, which is also the shape a misconfigured deploy fails into.
 */
import {
  addMessage,
  createThread,
  isThreadStatus,
  listThreads,
  setThreadStatus,
  THREAD_STATUSES,
  type DesignDb,
  type ListThreadsFilter,
  type ThreadStatus,
} from '../db/index.js';
import { principalLabel, readPrincipal, type DesignPrincipal } from './middleware/identity.js';
import { body, fail, query, str } from './shared/http.js';

import type { Request, Response, Router } from 'express';

/** Longest stored author label. A service token may name itself. */
const MAX_AUTHOR_LENGTH = 60;

function requireIdentity(res: Response): DesignPrincipal | null {
  const principal = readPrincipal(res);
  if (!principal) {
    fail(res, 403, 'no identity — is this surface behind Cloudflare Access?');
    return null;
  }
  return principal;
}

/**
 * Who a write is attributed to.
 *
 * A human session is always its own Access email: a self-declared name on the
 * request would let one operator write as another. A service token has no
 * identity of its own to protect, so it may name itself — that is how a
 * session's reply reads as "Claude" rather than as a token id.
 */
function authorOf(principal: DesignPrincipal, fields: Record<string, unknown>): string {
  if (principal.kind === 'user') return principal.email;
  return (str(fields['author']) ?? principal.commonName).slice(0, MAX_AUTHOR_LENGTH);
}

function readListFilter(req: Request, res: Response): ListThreadsFilter | null {
  const status = query(req, 'status');
  if (status !== undefined && !isThreadStatus(status)) {
    fail(res, 400, `status must be one of ${THREAD_STATUSES.join(', ')}`);
    return null;
  }
  const filter: ListThreadsFilter = {};
  if (status !== undefined) filter.status = status;
  const route = query(req, 'route');
  if (route !== undefined) filter.route = route;
  const since = query(req, 'since');
  if (since !== undefined) filter.since = since;
  return filter;
}

function readStatus(fields: Record<string, unknown>, res: Response): ThreadStatus | null {
  const status = str(fields['status']);
  if (status === undefined || !isThreadStatus(status)) {
    fail(res, 400, `status must be one of ${THREAD_STATUSES.join(', ')}`);
    return null;
  }
  return status;
}

/** The two read routes: who is calling, and what has been said. */
function mountReadRoutes(router: Router, db: DesignDb): void {
  router.get('/me', (_req, res) => {
    const principal = requireIdentity(res);
    if (!principal) return;
    res.json(
      principal.kind === 'user'
        ? { email: principal.email, service: null }
        : { email: null, service: principal.commonName }
    );
  });

  router.get('/threads', (req, res) => {
    if (!requireIdentity(res)) return;
    const filter = readListFilter(req, res);
    if (!filter) return;
    res.json({ threads: listThreads(db, filter) });
  });
}

/** Creating a thread: the one write that validates a whole anchor. */
function mountCreateRoute(router: Router, db: DesignDb): void {
  router.post('/threads', (req, res) => {
    const principal = requireIdentity(res);
    if (!principal) return;
    const fields = body(req);
    const route = str(fields['route']);
    const anchorKind = str(fields['anchorKind']);
    const anchor = str(fields['anchor']);
    const text = str(fields['body']);
    if (!route || !anchorKind || !anchor || !text) {
      fail(res, 400, 'route, anchorKind, anchor and body are required');
      return;
    }
    const id = createThread(db, {
      route,
      themeKey: str(fields['themeKey']) ?? '',
      viewport: str(fields['viewport']) ?? '',
      anchorKind,
      anchor,
      body: text,
      author: authorOf(principal, fields),
      now: new Date().toISOString(),
    });
    res.status(201).json({ id });
  });
}

/** Adding to a thread that already exists: a reply, or a status change. */
function mountUpdateRoutes(router: Router, db: DesignDb): void {
  router.post('/threads/:id/messages', (req, res) => {
    const principal = requireIdentity(res);
    if (!principal) return;
    const fields = body(req);
    const text = str(fields['body']);
    if (!text) {
      fail(res, 400, 'body is required');
      return;
    }
    const appended = addMessage(db, {
      threadId: req.params.id,
      author: authorOf(principal, fields),
      body: text,
      now: new Date().toISOString(),
    });
    if (!appended) {
      fail(res, 404, 'thread not found');
      return;
    }
    res.status(201).json({ ok: true });
  });

  router.patch('/threads/:id', (req, res) => {
    const principal = requireIdentity(res);
    if (!principal) return;
    const status = readStatus(body(req), res);
    if (!status) return;
    const updated = setThreadStatus(db, {
      threadId: req.params.id,
      status,
      resolvedBy: principalLabel(principal),
      now: new Date().toISOString(),
    });
    if (!updated) {
      fail(res, 404, 'thread not found');
      return;
    }
    res.json({ ok: true });
  });
}

/** Mount the thread routes on `router`, bound to one database handle. */
export function mountThreadRoutes(router: Router, db: DesignDb): void {
  mountReadRoutes(router, db);
  mountCreateRoute(router, db);
  mountUpdateRoutes(router, db);
}
