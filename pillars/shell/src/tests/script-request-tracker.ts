import { z } from 'zod';

const frameSchema = z.object({
  id: z.string(),
  loaderId: z.string(),
  parentId: z.string().optional(),
});
const requestSchema = z.object({
  requestId: z.string(),
  frameId: z.string().optional(),
  loaderId: z.string(),
  type: z.string().optional(),
  request: z.object({ method: z.string(), url: z.string() }),
});
const terminalSchema = z.object({ requestId: z.string() });

/** An unfinished browser Script request, identified independently of its URL. */
export interface PendingScriptRequest {
  readonly requestId: string;
  readonly frameId: string;
  readonly loaderId: string;
  readonly method: string;
  readonly url: string;
}

/**
 * Track main-frame CDP Script lifetimes. Only a confirmed replacement of a known
 * loader retires its abandoned scripts; iframe scripts and all REST use the existing guard.
 */
export class MainFrameScriptRequests {
  private frameId: string;
  private loaders = new Map<string, string>();
  private requests = new Map<string, PendingScriptRequest>();

  constructor(frameTree: unknown) {
    const { frame } = z
      .object({ frameTree: z.object({ frame: frameSchema }) })
      .parse(frameTree).frameTree;
    this.frameId = frame.id;
    if (frame.loaderId !== '') this.loaders.set(frame.id, frame.loaderId);
  }

  /** Record a Script start or redirect by its authoritative protocol request ID. */
  started(event: unknown): boolean {
    const request = requestSchema.parse(event);
    if (request.type !== 'Script' || request.frameId !== this.frameId) return false;
    this.requests.set(request.requestId, {
      requestId: request.requestId,
      frameId: request.frameId,
      loaderId: request.loaderId,
      method: request.request.method,
      url: request.request.url,
    });
    return true;
  }

  /** Retire only the request that actually finished or failed. */
  settled(event: unknown): boolean {
    return this.requests.delete(terminalSchema.parse(event).requestId);
  }

  /** A committed main-frame document replaces only that frame's previously known loader. */
  navigated(event: unknown): boolean {
    const { frame } = z.object({ frame: frameSchema }).parse(event);
    if (frame.parentId !== undefined || frame.loaderId === '') return false;
    this.frameId = frame.id;
    const previous = this.loaders.get(frame.id);
    this.loaders.set(frame.id, frame.loaderId);
    if (previous === undefined || previous === frame.loaderId) return false;
    let changed = false;
    for (const [id, request] of this.requests) {
      if (request.frameId === frame.id && request.loaderId === previous) {
        this.requests.delete(id);
        changed = true;
      }
    }
    return changed;
  }

  /** Read pending metadata without exposing mutable tracker state. */
  pending(): readonly PendingScriptRequest[] {
    return [...this.requests.values()];
  }
}
