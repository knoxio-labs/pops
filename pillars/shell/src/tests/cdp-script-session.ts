import { z } from 'zod';

import { MainFrameScriptRequests } from './script-request-tracker';

import type { ObservedScript } from './cdp-script-types';

const requestSchema = z.object({
  requestId: z.string(),
  type: z.string().optional(),
  request: z.object({ method: z.string(), url: z.string() }),
});
const frameSchema = z.object({
  id: z.string(),
  loaderId: z.string(),
  parentId: z.string().optional(),
});

/** One page or worker session; iframe scripts retain the existing Playwright guard. */
export class ScriptSession {
  private mainFrame: MainFrameScriptRequests | undefined;
  private readonly otherScripts = new Map<string, ObservedScript>();

  constructor(
    readonly id: string,
    readonly targetId: string,
    readonly kind: 'page' | 'iframe' | 'worker',
    readonly owner: { readonly pageTargetId: string; readonly parentSessionId: string | undefined }
  ) {}

  /** Initialise only from this session's actual Page.getFrameTree response. */
  frameTree(result: unknown): boolean {
    if (this.kind !== 'page' || this.mainFrame) return false;
    this.mainFrame = new MainFrameScriptRequests(result);
    return true;
  }

  /** Observe script starts, exact terminals and committed main-frame replacements. */
  received(method: string, params: unknown): boolean {
    if (method === 'Network.requestWillBeSent') return this.started(params);
    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      return this.settled(z.object({ requestId: z.string() }).parse(params).requestId);
    }
    if (method === 'Page.frameNavigated' && this.kind === 'page') return this.navigated(params);
    return false;
  }

  private started(params: unknown): boolean {
    const request = requestSchema.parse(params);
    if (request.type !== 'Script' || this.kind === 'iframe') return false;
    if (this.kind === 'page' && this.mainFrame) return this.mainFrame.started(params);
    this.otherScripts.set(request.requestId, {
      sessionId: this.id,
      requestId: request.requestId,
      method: request.request.method,
      url: request.request.url,
    });
    return true;
  }

  private navigated(params: unknown): boolean {
    const { frame } = z.object({ frame: frameSchema }).parse(params);
    if (frame.parentId !== undefined || frame.loaderId === '') return false;
    if (!this.mainFrame) {
      this.mainFrame = new MainFrameScriptRequests({ frameTree: { frame } });
      return true;
    }
    return this.mainFrame.navigated(params);
  }

  /** Settle one exact request, including a positively identified worker bootstrap. */
  settled(requestId: string): boolean {
    const other = this.otherScripts.delete(requestId);
    return (this.mainFrame?.settled({ requestId }) ?? false) || other;
  }

  /** Unknown early ownership remains pending until its actual terminal event. */
  pending(): readonly ObservedScript[] {
    return [
      ...this.otherScripts.values(),
      ...(this.mainFrame?.pending().map((request) => ({ ...request, sessionId: this.id })) ?? []),
    ];
  }
}
