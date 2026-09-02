/**
 * The overlay's client for the comment API.
 *
 * Every call is same-origin against `/design-api/`: in production the shell's
 * nginx proxies that prefix to the API container, and in dev Vite proxies it
 * to a deployed one with an Access service token attached server-side (see
 * `vite.config.ts`). A failed call resolves to `null` rather than throwing —
 * the overlay's answer to "the API is not reachable" is to hide itself, not
 * to break the canvas.
 */
import type { Anchor } from './anchors-types';

export const API_BASE = '/design-api';

export type ThreadStatus = 'open' | 'applied' | 'rejected' | 'outdated';

export const THREAD_STATUSES: readonly ThreadStatus[] = ['open', 'applied', 'rejected', 'outdated'];

export interface ThreadMessage {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface Thread {
  id: string;
  route: string;
  themeKey: string;
  viewport: string;
  anchorKind: Anchor['kind'];
  anchor: string;
  status: ThreadStatus;
  createdBy: string;
  createdAt: string;
  resolvedBy: string | null;
  resolvedAt: string | null;
  messages: ThreadMessage[];
}

async function call(path: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const response = await fetch(`${API_BASE}${path}`, init);
    if (!response.ok) return null;
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

/**
 * Who the API thinks is calling, or `null` when it cannot say — which is also
 * what an unreachable API looks like, and the signal the overlay hides on.
 */
export async function fetchIdentity(): Promise<{ email: string | null } | null> {
  const parsed = record(await call('/me'));
  if (!parsed) return null;
  return { email: typeof parsed['email'] === 'string' ? parsed['email'] : null };
}

export async function fetchThreads(route?: string): Promise<Thread[] | null> {
  const query = route === undefined ? '' : `?route=${encodeURIComponent(route)}`;
  const parsed = record(await call(`/threads${query}`));
  const threads = parsed?.['threads'];
  return Array.isArray(threads) ? (threads as Thread[]) : null;
}

const JSON_HEADERS = { 'content-type': 'application/json' };

export interface CreateThreadArgs {
  route: string;
  themeKey: string;
  viewport: string;
  anchor: Anchor;
  body: string;
}

export async function createThread(args: CreateThreadArgs): Promise<boolean> {
  const { kind, ...rest } = args.anchor;
  const created = await call('/threads', {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({
      route: args.route,
      themeKey: args.themeKey,
      viewport: args.viewport,
      anchorKind: kind,
      anchor: JSON.stringify(rest),
      body: args.body,
    }),
  });
  return created !== null;
}

export async function replyToThread(threadId: string, body: string): Promise<boolean> {
  const replied = await call(`/threads/${threadId}/messages`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ body }),
  });
  return replied !== null;
}

export async function setThreadStatus(threadId: string, status: ThreadStatus): Promise<boolean> {
  const updated = await call(`/threads/${threadId}`, {
    method: 'PATCH',
    headers: JSON_HEADERS,
    body: JSON.stringify({ status }),
  });
  return updated !== null;
}
