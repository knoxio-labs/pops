import { z } from 'zod';

import { ScriptObservations } from './cdp-script-observation';
import { inspectCdpMessage } from './cdp-script-types';
import { WorkerStartupFence } from './cdp-worker-startup';

import type { CdpCommand, CdpMessage } from './cdp-script-types';

/** Public wire operations needed by the sole flattened CDP connection. */
export interface ScriptCdpWire {
  readonly send: (data: string) => void;
  readonly close: () => void;
  readonly onMessage: (listener: (data: unknown) => void) => void;
  readonly onClose: (listener: (reason: string) => void) => void;
  readonly onError: (listener: () => void) => void;
}

/**
 * A structural public ConnectOverCDPTransport. Complete real messages retain their
 * fields and IDs; only known-worker resumes wait for actual same-session setup replies.
 */
export class ScriptCdpTransport {
  readonly observations = new ScriptObservations();
  private readonly startup = new WorkerStartupFence((sessionId, error) =>
    this.observations.failed(sessionId, error)
  );
  private readonly commands = new Map<number, CdpCommand>();
  private readonly buffered: object[] = [];
  private messageListener: ((message: object) => void) | undefined;
  private closeListener: ((reason?: string) => void) | undefined;
  private closed = false;
  private closing = false;
  private closeReason: string | undefined;

  /** Regression controls may defer a real reply; they never replace or fabricate one. */
  beforeWorkerReply: ((command: CdpCommand) => Promise<void>) | undefined;

  constructor(private readonly wire: ScriptCdpWire) {
    wire.onMessage((data) => {
      try {
        if (typeof data !== 'string') throw new Error('Non-text CDP frame');
        const raw = z.record(z.string(), z.unknown()).parse(JSON.parse(data));
        void this.received(raw).catch((error: unknown) => this.fail(error));
      } catch (error) {
        this.fail(error);
      }
    });
    wire.onClose((reason) => {
      if (!this.closing)
        this.observations.failed(
          undefined,
          new Error('Browser CDP transport disconnected unexpectedly')
        );
      this.closed = true;
      this.closeReason = reason;
      this.startup.disconnected();
      this.closeListener?.(reason);
    });
    wire.onError(() => this.fail(new Error('Browser CDP transport failed')));
  }

  /** Deliver complete real protocol messages, retaining any received before listener installation. */
  get onmessage(): ((message: object) => void) | undefined {
    return this.messageListener;
  }
  set onmessage(listener: ((message: object) => void) | undefined) {
    this.messageListener = listener;
    if (listener) for (const message of this.buffered.splice(0)) listener(message);
  }

  /** Preserve the actual socket close notification, including an early setup disconnect. */
  get onclose(): ((reason?: string) => void) | undefined {
    return this.closeListener;
  }
  set onclose(listener: ((reason?: string) => void) | undefined) {
    this.closeListener = listener;
    if (listener && this.closed) listener(this.closeReason);
  }

  /** Send actual commands unchanged, or retain the actual worker resume until readiness is proven. */
  send(raw: object): void {
    try {
      if (this.closed) throw new Error('Browser CDP transport is closed');
      const message = inspectCdpMessage(raw);
      if (message.id === undefined || message.method === undefined)
        throw new Error('Malformed CDP command');
      if (this.commands.has(message.id)) throw new Error('Duplicate outstanding CDP command ID');
      const command = {
        id: message.id,
        method: message.method,
        sessionId: message.sessionId,
        params: message.params,
      };
      this.commands.set(command.id, command);
      if (!this.startup.hold(command, raw)) this.wire.send(JSON.stringify(raw));
    } catch (error) {
      this.fail(error);
      throw error;
    }
  }

  /** Close the wire without substituting acknowledgements for outstanding commands. */
  close(): void {
    this.closing = true;
    this.wire.close();
  }

  private async received(raw: object): Promise<void> {
    if (this.closed) return;
    const message = inspectCdpMessage(raw);
    const command = this.pendingReply(message);
    if (command && this.startup.owns(command.sessionId) && this.beforeWorkerReply)
      await this.beforeWorkerReply(command);
    if (this.closed) return;
    this.lifecycle(message);
    if (message.method)
      this.observations.received(message.sessionId, message.method, message.params);
    if (command) this.acknowledged(command, message);
    if (this.messageListener) this.messageListener(raw);
    else this.buffered.push(raw);
    for (const resume of this.startup.ready()) this.wire.send(JSON.stringify(resume));
  }

  private pendingReply(message: CdpMessage): CdpCommand | undefined {
    const command = message.id === undefined ? undefined : this.commands.get(message.id);
    if (command && command.sessionId !== message.sessionId)
      throw new Error('Mismatched CDP command acknowledgement');
    return command;
  }

  private lifecycle(message: CdpMessage): void {
    if (message.method === 'Target.attachedToTarget') {
      const worker = this.observations.attached(message.sessionId, message.params);
      if (worker)
        this.startup.attached(worker.sessionId, message.sessionId, worker.waitingForDebugger);
    }
    if (message.method === 'Target.detachedFromTarget') {
      const { sessionId } = z.object({ sessionId: z.string() }).parse(message.params);
      for (const removed of this.startup.detached(sessionId)) {
        this.observations.detached(removed);
        this.forgetCommands(removed);
      }
    }
  }

  private forgetCommands(sessionId: string): void {
    for (const [id, command] of this.commands) {
      if (command.sessionId === sessionId) this.commands.delete(id);
    }
  }

  private acknowledged(command: CdpCommand, message: CdpMessage): void {
    this.commands.delete(command.id);
    this.startup.acknowledged(command, message.error);
    if (command.method === 'Page.getFrameTree' && message.error === undefined)
      this.observations.frameTree(command.sessionId, message.result);
  }

  private fail(error: unknown): void {
    this.observations.failed(undefined, error instanceof Error ? error : new Error(String(error)));
    this.closing = true;
    this.wire.close();
  }
}
