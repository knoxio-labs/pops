/**
 * Handlers for the `jobs.*` sub-router.
 *
 * Thin adapters over `@pops/pillar-jobs`'s transport-agnostic handlers: they
 * translate this pillar's queue availability into the injected deps, and the
 * package's errors into this pillar's `HttpError` envelopes. All the queue
 * logic lives in the package, so every pillar that mounts the surface behaves
 * identically.
 *
 * The queue list is read through a getter rather than captured once, so the
 * app can be constructed before (or entirely without) Redis and still answer
 * 503 rather than having baked an empty registry in at startup.
 */
import {
  DeadLetterReplayError,
  JobNotFoundError,
  JobStateConflictError,
  JobsUnavailableError,
  NoDeadLetterQueueError,
  UnknownQueueError,
  makeJobsHandlers,
  type JobState,
  type JobsHandlerDeps,
  type ManagedJobQueue,
} from '@pops/pillar-jobs';

import { getAiMaintenanceQueues } from '../jobs/queue.js';
import { ConflictError, NotFoundError, ServiceUnavailableError } from '../shared/errors.js';
import { runHttp } from './error-mapping.js';

import type { ServerInferRequest } from '@ts-rest/core';

import type { aiJobsContract } from '../../contract/rest-jobs.js';

type Req = ServerInferRequest<typeof aiJobsContract>;

const deps: JobsHandlerDeps = {
  get queues(): readonly ManagedJobQueue[] {
    const queues = getAiMaintenanceQueues();
    if (queues === null) return [];
    return [{ queue: queues.queue, deadLetterQueue: queues.deadLetterQueue }];
  },
};

/** Translates a `@pops/pillar-jobs` error into this pillar's HTTP envelope. */
function translate(err: unknown): never {
  if (err instanceof JobsUnavailableError) throw new ServiceUnavailableError(err.message);
  if (err instanceof UnknownQueueError) throw new NotFoundError('Queue', err.queueName);
  if (err instanceof NoDeadLetterQueueError) {
    throw new NotFoundError('Dead-letter queue for', err.queueName);
  }
  if (err instanceof JobNotFoundError) throw new NotFoundError('Job', err.jobId);
  if (err instanceof JobStateConflictError) throw new ConflictError(err.message);
  if (err instanceof DeadLetterReplayError) {
    if (err.reason === 'missing') throw new NotFoundError('Dead-letter job', err.jobId);
    // `malformed` and `foreign` are both 409: the request is well formed, it
    // is the parked payload that cannot go where the caller asked. A 400
    // would invite the caller to retry with a different body, which is futile.
    throw new ConflictError(err.message);
  }
  throw err as Error;
}

/** Runs a jobs operation, mapping package errors onto the pillar's envelopes. */
async function runJobs<T>(fn: () => Promise<T> | T): Promise<{ status: 200; body: T }> {
  try {
    return { status: 200, body: await fn() };
  } catch (err) {
    translate(err);
  }
}

/** The list filter is a single state on the wire; the package takes a set. */
function statesOf(state: JobState | undefined): { states?: readonly JobState[] } {
  return state === undefined ? {} : { states: [state] };
}

export function makeAiJobsHandlers() {
  const jobs = makeJobsHandlers(deps);

  return {
    queues: () => runHttp(() => runJobs(() => jobs.queues())),

    stats: () => runHttp(() => runJobs(() => jobs.stats())),

    drain: ({ body }: Req['drain']) =>
      runHttp(() => runJobs(() => jobs.drain({ queue: body.queue, delayed: body.delayed }))),

    listDeadLetter: ({ query }: Req['listDeadLetter']) =>
      runHttp(() =>
        runJobs(() =>
          jobs.listDeadLetter({
            queue: query.queue,
            limit: query.limit,
            offset: query.offset,
            ...statesOf(query.state),
          })
        )
      ),

    replayDeadLetter: ({ params, body }: Req['replayDeadLetter']) =>
      runHttp(() => runJobs(() => jobs.replayDeadLetter({ queue: body.queue, id: params.id }))),

    list: ({ query }: Req['list']) =>
      runHttp(() =>
        runJobs(() =>
          jobs.list({
            queue: query.queue,
            limit: query.limit,
            offset: query.offset,
            ...statesOf(query.state),
          })
        )
      ),

    get: ({ params, query }: Req['get']) =>
      runHttp(() => runJobs(() => jobs.get({ queue: query.queue, id: params.id }))),

    retry: ({ params, body }: Req['retry']) =>
      runHttp(() => runJobs(() => jobs.retry({ queue: body.queue, id: params.id }))),

    cancel: ({ params, body }: Req['cancel']) =>
      runHttp(() => runJobs(() => jobs.cancel({ queue: body.queue, id: params.id }))),
  };
}
