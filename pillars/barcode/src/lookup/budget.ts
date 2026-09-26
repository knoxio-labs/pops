import type { BookSource, SourceAnswer } from './source.js';

/** Shared source deadline required by the barcode lookup contract. */
export const LOOKUP_BUDGET_MS = 8_000;

/** Maximum duration allowed for one provider attempt. */
export const SOURCE_BUDGET_MS = 4_000;

type SourceAttempt =
  | { readonly kind: 'answer'; readonly answer: SourceAnswer }
  | { readonly kind: 'timeout'; readonly scope: 'source' | 'lookup' };

interface LookupBudget {
  readonly signal: AbortSignal;
  readonly deadline: Promise<SourceAttempt>;
  cancel(): void;
}

/** Create one total deadline shared by all source attempts in a lookup. */
export function createLookupBudget(): LookupBudget {
  const signal = AbortSignal.timeout(LOOKUP_BUDGET_MS);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let finish: (() => void) | undefined;
  const deadline = new Promise<SourceAttempt>((resolve) => {
    let settled = false;
    finish = () => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolve({ kind: 'timeout', scope: 'lookup' });
    };
    timer = setTimeout(finish, LOOKUP_BUDGET_MS);
    timer.unref();
    if (signal.aborted) finish();
    else signal.addEventListener('abort', finish, { once: true });
  });

  return {
    signal,
    deadline,
    cancel(): void {
      if (timer !== undefined) clearTimeout(timer);
    },
  };
}

/** Run one source with its own cap while retaining the shared lookup deadline. */
export function sourceAttempt(
  source: BookSource,
  isbn13: string,
  budget: LookupBudget
): Promise<SourceAttempt> {
  const sourceController = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const abortSource = (): void => {
    sourceController.abort(budget.signal.reason);
  };
  budget.signal.addEventListener('abort', abortSource, { once: true });
  const sourceDeadline = new Promise<SourceAttempt>((resolve) => {
    timer = setTimeout(() => {
      sourceController.abort();
      resolve({ kind: 'timeout', scope: 'source' });
    }, SOURCE_BUDGET_MS);
    timer.unref();
  });
  const cleanup = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    budget.signal.removeEventListener('abort', abortSource);
  };

  let request: Promise<SourceAnswer>;
  try {
    request = source.lookUp(isbn13, sourceController.signal);
  } catch {
    return Promise.resolve<SourceAttempt>({
      kind: 'answer',
      answer: { kind: 'unavailable' },
    }).finally(cleanup);
  }

  const answer = request
    .then((value) => ({ kind: 'answer' as const, answer: value }))
    .catch(() => ({ kind: 'answer' as const, answer: { kind: 'unavailable' as const } }));
  return Promise.race([answer, sourceDeadline, budget.deadline]).finally(cleanup);
}
