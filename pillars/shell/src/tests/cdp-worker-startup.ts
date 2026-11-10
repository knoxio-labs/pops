import { z } from 'zod';

import type { CdpCommand } from './cdp-script-types';

interface WorkerStartup {
  readonly resumes: object[];
  network: boolean;
  recursive: boolean;
  failed: boolean;
}

/** Fence the sole client's real worker resumes until its own observation commands succeed. */
export class WorkerStartupFence {
  private readonly workers = new Map<string, WorkerStartup>();

  constructor(private readonly failed: (sessionId: string, error: Error) => void) {}

  /** An existing running worker cannot retroactively prove its early request coverage. */
  attached(sessionId: string, waitingForDebugger: boolean): void {
    this.workers.set(sessionId, {
      resumes: [],
      network: false,
      recursive: false,
      failed: !waitingForDebugger,
    });
    if (!waitingForDebugger)
      this.failed(
        sessionId,
        new Error('Worker began execution before script observation owned its startup')
      );
  }

  /** Test whether a command belongs to an explicitly attached dedicated worker. */
  owns(sessionId: string | undefined): boolean {
    return sessionId !== undefined && this.workers.has(sessionId);
  }

  /** Retain each actual resume object; no successful reply is generated for it. */
  hold(command: CdpCommand, raw: object): boolean {
    const sessionId = command.sessionId;
    if (sessionId === undefined) return false;
    const worker = this.workers.get(sessionId);
    if (!worker) return false;
    if (command.method === 'Network.disable') {
      worker.network = false;
      worker.failed = true;
      this.failed(sessionId, new Error('Worker Network observation was disabled'));
    }
    if (
      command.method !== 'Runtime.runIfWaitingForDebugger' ||
      (!worker.failed && worker.network && worker.recursive)
    )
      return false;
    worker.resumes.push(raw);
    return true;
  }

  /** Only the real same-session acknowledgement establishes readiness. */
  acknowledged(command: CdpCommand, error: unknown): void {
    const sessionId = command.sessionId;
    if (sessionId === undefined) return;
    const worker = this.workers.get(sessionId);
    if (
      !worker ||
      (command.method !== 'Network.enable' && command.method !== 'Target.setAutoAttach')
    )
      return;
    if (error !== undefined) {
      worker.failed = true;
      this.failed(sessionId, new Error(`Worker ${command.method} failed`));
    } else if (command.method === 'Network.enable') {
      worker.network = true;
    } else {
      const configuration = z
        .object({
          autoAttach: z.literal(true),
          waitForDebuggerOnStart: z.literal(true),
          flatten: z.literal(true),
        })
        .safeParse(command.params);
      worker.recursive = configuration.success;
      if (!configuration.success) {
        worker.failed = true;
        this.failed(sessionId, new Error('Worker recursive script observation was displaced'));
      }
    }
  }

  /** Release original queued commands once both actual setup replies succeeded. */
  ready(): readonly object[] {
    return [...this.workers.values()].flatMap((worker) =>
      !worker.failed && worker.network && worker.recursive ? worker.resumes.splice(0) : []
    );
  }

  /** Invalidate every supplied observed descendant before any delayed reply can release it. */
  detached(sessionIds: readonly string[]): void {
    for (const id of sessionIds) {
      const worker = this.workers.get(id);
      if (worker?.resumes.length)
        this.failed(id, new Error('Worker detached before startup observation completed'));
      this.workers.delete(id);
    }
  }

  /** A disconnect with unresolved startup must remain a visible observation failure. */
  disconnected(): void {
    for (const [sessionId, worker] of this.workers) {
      if (worker.resumes.length > 0)
        this.failed(sessionId, new Error('Browser disconnected with worker startup pending'));
    }
  }
}
