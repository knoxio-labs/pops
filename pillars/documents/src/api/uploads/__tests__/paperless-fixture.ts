import { once } from 'node:events';
import { createServer } from 'node:http';

import { PaperlessClient } from '../../modules/paperless/client.js';
import { deferred } from './streams.js';

import type { IncomingMessage, ServerResponse } from 'node:http';

type ReplyMode = 'accepted' | 'lost' | 'malformed' | 'redirect' | 'held';
type TaskMode = 'pending' | 'done' | 'duplicate' | 'failed' | 'missing' | 'unavailable';

function taskResult(task: TaskMode): object[] {
  if (task === 'missing') return [];
  let status = 'failure';
  let result_data: object | null = null;
  if (task === 'pending') status = 'pending';
  if (task === 'done') {
    status = 'success';
    result_data = { document_id: 91 };
  }
  if (task === 'duplicate') result_data = { duplicate_of: 92 };
  if (task === 'failed') result_data = { error_message: 'Fixture refusal' };
  return [{ task_id: 'task-proof-1', status, result_data }];
}

class PaperlessFixture {
  posts = 0;
  readonly postBodies: string[] = [];
  taskReads = 0;
  held: ServerResponse | undefined;
  private mode: ReplyMode = 'accepted';
  private task: TaskMode = 'pending';
  private readonly heldReply = deferred<ServerResponse>();
  private readonly server = createServer((req, res): void => this.handle(req, res));

  async listen(): Promise<PaperlessClient> {
    await once(this.server.listen(0, '127.0.0.1'), 'listening');
    const address = this.server.address();
    if (address === null || typeof address === 'string')
      throw new Error('Missing loopback address');
    return new PaperlessClient(`http://127.0.0.1:${address.port}`, 'fixture-only');
  }

  setMode(value: ReplyMode): void {
    this.mode = value;
  }

  setTask(value: TaskMode): void {
    this.task = value;
  }

  waitHeld(): Promise<ServerResponse> {
    return this.heldReply.promise;
  }

  close(): Promise<void> {
    return new Promise<void>((resolve, reject): void => {
      this.server.close((error): void => (error === undefined ? resolve() : reject(error)));
      this.server.closeAllConnections();
    });
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    if (req.method === 'POST') {
      this.posts += 1;
      const parts: Uint8Array[] = [];
      req.on('data', (chunk: unknown): void => {
        if (chunk instanceof Uint8Array) parts.push(chunk);
      });
      req.on('end', (): void => {
        this.postBodies.push(Buffer.concat(parts).toString());
        this.reply(res);
      });
      return;
    }
    if (req.url?.startsWith('/api/tasks/') === true) {
      this.taskReads += 1;
      if (this.task === 'unavailable') {
        res.writeHead(503).end();
        return;
      }
      res.setHeader('Content-Type', 'application/json');
      const results = taskResult(this.task);
      res.end(JSON.stringify({ count: results.length, next: null, previous: null, results }));
      return;
    }
    res.writeHead(404).end();
  }

  private reply(res: ServerResponse): void {
    if (this.mode === 'lost') {
      res.destroy();
      return;
    }
    if (this.mode === 'redirect') {
      res.writeHead(307, { Location: '/foreign' }).end();
      return;
    }
    if (this.mode === 'held') {
      this.held = res;
      this.heldReply.resolve(res);
      return;
    }
    res.setHeader('Content-Type', 'application/json');
    res.end(this.mode === 'malformed' ? '{}' : JSON.stringify('task-proof-1'));
  }
}

/** Create an actual HTTP upstream with controlled POST and task responses. */
export function paperlessFixture(): PaperlessFixture {
  return new PaperlessFixture();
}
