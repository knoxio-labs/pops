/**
 * In-memory doubles for the ports in `src/ports.ts`.
 *
 * They model only what the operations under test observe — a job list with
 * per-job state, and a scheduler map keyed by id — which is exactly the seam
 * the ports exist to expose. The claim that the real bullmq classes still fit
 * those ports is proved separately, at compile time, by `conformance.ts`, and
 * the durability claim by `scheduler.live-seam.test.ts` against a real Redis.
 */
import type {
  ExistingSchedule,
  JobEnqueueOptions,
  JobQueuePort,
  JobRecord,
  ScheduleCadence,
  SchedulerQueuePort,
} from '../ports.js';

export interface FakeJobInit<Data> {
  readonly id: string;
  readonly data: Data;
  readonly name?: string;
  readonly state?: string;
  readonly attempts?: number;
  readonly attemptsMade?: number;
  readonly failedReason?: string;
  readonly stacktrace?: readonly string[];
  readonly timestamp?: number;
  readonly processedOn?: number;
  readonly finishedOn?: number;
  readonly progress?: unknown;
}

export class FakeJob<Data = unknown> implements JobRecord<Data> {
  readonly id: string;
  readonly name: string;
  readonly data: Data;
  readonly opts: { attempts?: number | undefined };
  readonly attemptsMade: number;
  readonly failedReason: string | undefined;
  readonly stacktrace: readonly string[] | null;
  readonly timestamp: number;
  readonly processedOn: number | undefined;
  readonly finishedOn: number | undefined;
  readonly progress: unknown;

  state: string;
  removed = false;
  retriedFrom: string | null = null;

  constructor(init: FakeJobInit<Data>) {
    this.id = init.id;
    this.name = init.name ?? 'job';
    this.data = init.data;
    this.opts = { attempts: init.attempts };
    this.attemptsMade = init.attemptsMade ?? 0;
    this.failedReason = init.failedReason;
    this.stacktrace = init.stacktrace ?? null;
    this.timestamp = init.timestamp ?? 0;
    this.processedOn = init.processedOn;
    this.finishedOn = init.finishedOn;
    this.progress = init.progress;
    this.state = init.state ?? 'waiting';
  }

  getState(): Promise<string> {
    return Promise.resolve(this.state);
  }

  remove(): Promise<void> {
    this.removed = true;
    return Promise.resolve();
  }

  retry(state?: 'completed' | 'failed'): Promise<void> {
    this.retriedFrom = state ?? null;
    this.state = 'waiting';
    return Promise.resolve();
  }
}

/** Records one enqueue for assertion. */
export interface RecordedAdd<Data> {
  readonly name: string;
  readonly data: Data;
  readonly opts: JobEnqueueOptions | undefined;
}

export class FakeQueue<Data = unknown> implements JobQueuePort<Data>, SchedulerQueuePort<Data> {
  readonly adds: RecordedAdd<Data>[] = [];
  readonly drains: boolean[] = [];
  readonly schedulerCalls: string[] = [];

  private nextId = 1;
  private readonly jobs: FakeJob<Data>[];
  private readonly schedules = new Map<string, ExistingSchedule>();

  constructor(
    readonly name: string,
    jobs: readonly FakeJob<Data>[] = []
  ) {
    this.jobs = [...jobs];
  }

  add(name: string, data: Data, opts?: JobEnqueueOptions): Promise<JobRecord<Data>> {
    this.adds.push({ name, data, opts });
    const job = new FakeJob<Data>({ id: `added-${this.nextId++}`, name, data });
    this.jobs.push(job);
    return Promise.resolve(job);
  }

  getJob(id: string): Promise<JobRecord<Data> | undefined> {
    return Promise.resolve(this.jobs.find((job) => job.id === id && !job.removed));
  }

  getJobs(
    types?: readonly string[] | string,
    start?: number,
    end?: number
  ): Promise<JobRecord<Data>[]> {
    const wanted =
      types === undefined ? null : new Set(typeof types === 'string' ? [types] : types);
    const matching = this.jobs.filter(
      (job) => !job.removed && (wanted === null || wanted.has(job.state))
    );
    const from = start ?? 0;
    const to = end ?? matching.length - 1;
    return Promise.resolve(matching.slice(from, to + 1));
  }

  getJobCounts(...types: string[]): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    for (const type of types) counts[type] = 0;
    for (const job of this.jobs) {
      if (job.removed) continue;
      if (!types.includes(job.state)) continue;
      counts[job.state] = (counts[job.state] ?? 0) + 1;
    }
    return Promise.resolve(counts);
  }

  drain(delayed?: boolean): Promise<void> {
    this.drains.push(delayed ?? true);
    return Promise.resolve();
  }

  /** Seeds a scheduler as if a previous process had registered it. */
  seedSchedule(schedule: ExistingSchedule): void {
    this.schedules.set(schedule.key, schedule);
  }

  upsertJobScheduler(
    id: string,
    repeat: ScheduleCadence,
    template?: { name?: string; data?: Data }
  ): Promise<unknown> {
    this.schedulerCalls.push(`upsert:${id}`);
    this.schedules.set(id, {
      key: id,
      name: template?.name ?? 'job',
      ...(repeat.every === undefined ? {} : { every: repeat.every }),
      ...(repeat.pattern === undefined ? {} : { pattern: repeat.pattern }),
      ...(repeat.tz === undefined ? {} : { tz: repeat.tz }),
    });
    return Promise.resolve(undefined);
  }

  getJobSchedulers(): Promise<ExistingSchedule[]> {
    return Promise.resolve([...this.schedules.values()]);
  }

  removeJobScheduler(id: string): Promise<boolean> {
    this.schedulerCalls.push(`remove:${id}`);
    return Promise.resolve(this.schedules.delete(id));
  }
}
