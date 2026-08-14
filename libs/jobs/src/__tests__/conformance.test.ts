import { describe, expect, it } from 'vitest';

import {
  JOB_SATISFIES_JOB_RECORD,
  QUEUE_SATISFIES_JOB_QUEUE_PORT,
  QUEUE_SATISFIES_SCHEDULER_PORT,
} from '../conformance.js';

/**
 * These constants are `true` only while bullmq's own classes still satisfy the
 * ports every operation in this package is written against — the compiler is
 * the assertion, and this suite is what makes it fail loudly rather than
 * silently narrowing to `false`.
 */
describe('bullmq port conformance', () => {
  it('keeps Queue satisfying the admin port', () => {
    expect(QUEUE_SATISFIES_JOB_QUEUE_PORT).toBe(true);
  });

  it('keeps Queue satisfying the scheduler port', () => {
    expect(QUEUE_SATISFIES_SCHEDULER_PORT).toBe(true);
  });

  it('keeps Job satisfying the job read port', () => {
    expect(JOB_SATISFIES_JOB_RECORD).toBe(true);
  });
});
