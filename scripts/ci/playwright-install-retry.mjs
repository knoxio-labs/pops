#!/usr/bin/env node
/**
 * Runs a flaky, lock-contending command with a bounded retry that can actually
 * succeed on a later attempt.
 *
 * A naive `for attempt in 1 2 3; do timeout 300 cmd && exit 0; sleep …; done`
 * loop races itself when `cmd` shells out to `apt-get`/`dpkg`: `timeout`
 * signals only the process it spawned directly, but `sudo` (used internally by
 * `playwright install-deps` to invoke apt) intentionally decouples the child
 * it execs from signals sent to its own process group, so the apt/dpkg process
 * survives the timeout and keeps `/var/lib/dpkg/lock-frontend` held. Attempt 2
 * starts immediately, finds the lock still held by attempt 1's orphan, and
 * dies instantly — every "retry" collapses into one ~60s failure no matter how
 * many attempts are configured.
 *
 * `retryWithLockClear` fixes the ordering: between attempts it kills whatever
 * still holds the lock and waits for that hold to actually clear before the
 * next attempt starts, so a retry contends with nothing.
 *
 * `run`, `isLockHeld`, `killStaleHolders` and `sleep` are injected so the
 * orchestration can be driven by a fake lock/clock in tests
 * (`__tests__/playwright-install-retry.test.ts`); the CLI at the bottom wires
 * them to a real subprocess, `fuser` and `pkill`.
 */

/**
 * @param {object} opts
 * @param {number} opts.attempts Total bounded attempts.
 * @param {(attempt: number) => boolean | Promise<boolean>} opts.run Runs one attempt; returns whether it succeeded.
 * @param {() => boolean | Promise<boolean>} opts.isLockHeld Whether the contended resource is currently held.
 * @param {(attempt: number) => void | Promise<void>} opts.killStaleHolders Kills whatever is holding the resource.
 * @param {(ms: number) => Promise<void>} opts.sleep
 * @param {(attempt: number) => number} opts.backoffMs Backoff before the next attempt, once the lock is clear.
 * @param {number} [opts.lockPollMs] Interval between lock-held checks while waiting.
 * @param {number} [opts.maxLockWaitPolls] Upper bound on polls, so a lock that never clears cannot hang the job.
 * @param {(event: { type: string; attempt: number }) => void} [opts.onEvent]
 * @returns {Promise<{ success: boolean; attempt: number }>}
 */
export async function retryWithLockClear({
  attempts,
  run,
  isLockHeld,
  killStaleHolders,
  sleep,
  backoffMs,
  lockPollMs = 1000,
  maxLockWaitPolls = 60,
  onEvent = () => {},
}) {
  if (attempts < 1) throw new RangeError('attempts must be >= 1');

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const ok = await run(attempt);
    if (ok) return { success: true, attempt };

    onEvent({ type: 'attempt-failed', attempt });

    if (attempt < attempts) {
      await killStaleHolders(attempt);
      const cleared = await waitForLockClear({ isLockHeld, sleep, lockPollMs, maxLockWaitPolls });
      onEvent({ type: cleared ? 'lock-cleared' : 'lock-wait-exhausted', attempt });
      await sleep(backoffMs(attempt));
    }
  }

  return { success: false, attempt: attempts };
}

/**
 * Polls `isLockHeld` at most `maxLockWaitPolls` times so a lock that never
 * clears bounds the wait instead of hanging the job indefinitely — the same
 * "bounded" property the retry itself is supposed to have.
 *
 * @param {object} opts
 * @param {() => boolean | Promise<boolean>} opts.isLockHeld
 * @param {(ms: number) => Promise<void>} opts.sleep
 * @param {number} opts.lockPollMs
 * @param {number} opts.maxLockWaitPolls
 * @returns {Promise<boolean>}
 */
async function waitForLockClear({ isLockHeld, sleep, lockPollMs, maxLockWaitPolls }) {
  for (let i = 0; i < maxLockWaitPolls; i += 1) {
    if (!(await isLockHeld())) return true;
    await sleep(lockPollMs);
  }
  return !(await isLockHeld());
}

/**
 * The wall-clock ceiling a given configuration implies, in seconds: every
 * attempt burning its full timeout, and every gap between attempts spending
 * the whole bounded lock wait before its backoff.
 *
 * This is exported because the number is only meaningful next to another one —
 * the `timeout-minutes` GitHub puts on the step that invokes this script. When
 * the ceiling exceeds that timeout the retry is a fiction: the runner kills the
 * step part-way through the loop, the `::error::` below never prints, and the
 * log ends on a bare `The operation was canceled`. That is the exact failure
 * signature POPS-2302 was filed about, moved from the job to the step.
 * `__tests__/playwright-install-retry.test.ts` reads the real workflow and
 * holds the two numbers against each other.
 *
 * @param {object} opts
 * @param {number} opts.attempts
 * @param {number} opts.timeoutSeconds Per-attempt ceiling.
 * @param {(attempt: number) => number} opts.backoffMs
 * @param {number} [opts.lockPollMs]
 * @param {number} [opts.maxLockWaitPolls]
 * @returns {number}
 */
export function worstCaseSeconds({
  attempts,
  timeoutSeconds,
  backoffMs,
  lockPollMs = 1000,
  maxLockWaitPolls = 60,
}) {
  let ms = attempts * timeoutSeconds * 1000;
  for (let attempt = 1; attempt < attempts; attempt += 1) {
    ms += lockPollMs * maxLockWaitPolls + backoffMs(attempt);
  }
  return ms / 1000;
}

/**
 * What the CLI uses when a flag is absent. Exported so the workflow test reads
 * the same numbers the workflow actually runs with instead of a copy of them.
 *
 * `attempts` is 2 rather than 3 because three attempts at a 300s ceiling is
 * 900s of attempts alone, before a single backoff — more than the 15-minute
 * step timeout, and there is no room to raise that: the job has 30 minutes for
 * checkout, install, build, the browser install and the suite itself. Two
 * attempts is what fits, and one retry is the whole mechanism anyway: attempt 2
 * is the one that runs after the dpkg lock has been cleared.
 */
export const CLI_DEFAULTS = {
  attempts: 2,
  timeoutSeconds: 300,
  lockPollMs: 1000,
  maxLockWaitPolls: 60,
  /** @param {number} attempt */
  backoffMs: (attempt) => attempt * 45_000,
};

async function cliMain() {
  const { spawn, spawnSync } = await import('node:child_process');

  const argv = process.argv.slice(2);
  const dashDash = argv.indexOf('--');
  if (dashDash === -1 || dashDash === argv.length - 1) {
    console.error(
      'usage: playwright-install-retry.mjs [--attempts N] [--timeout-seconds N] ' +
        '[--lock-file PATH] [--label STRING] -- <command> [args...]'
    );
    process.exit(2);
  }
  const flags = argv.slice(0, dashDash);
  const command = argv.slice(dashDash + 1);

  /**
   * @param {string} name
   * @param {string} fallback
   * @returns {string}
   */
  const flagValue = (name, fallback) => {
    const i = flags.indexOf(name);
    if (i === -1) return fallback;
    return flags[i + 1] ?? fallback;
  };

  const attempts = Number(flagValue('--attempts', String(CLI_DEFAULTS.attempts)));
  const timeoutSeconds = Number(
    flagValue('--timeout-seconds', String(CLI_DEFAULTS.timeoutSeconds))
  );
  const lockFile = flagValue('--lock-file', '/var/lib/dpkg/lock-frontend');
  const label = flagValue('--label', command.join(' '));

  const [commandBin, ...commandArgs] = command;
  if (commandBin === undefined) {
    console.error('usage: playwright-install-retry.mjs ... -- <command> [args...]');
    process.exit(2);
  }

  const runAttempt = () =>
    new Promise((resolve) => {
      const child = spawn(commandBin, commandArgs, { stdio: 'inherit', detached: true });
      const timer = setTimeout(() => {
        // `detached: true` puts the child in its own process group; killing the
        // negative pid signals the whole group, not just the direct child. It
        // still cannot reach a process `sudo` has deliberately decoupled from
        // that group, which is exactly why `killStaleHolders` also exists.
        try {
          if (child.pid !== undefined) process.kill(-child.pid, 'SIGKILL');
        } catch {
          // Group already gone.
        }
      }, timeoutSeconds * 1000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve(code === 0);
      });
      child.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });

  const isLockHeld = () => spawnSync('sudo', ['fuser', lockFile], { stdio: 'ignore' }).status === 0;

  const killStaleHolders = () => {
    spawnSync('sudo', ['pkill', '-9', '-f', 'apt-get|dpkg'], { stdio: 'ignore' });
  };

  // Printed before the first attempt so a step that later dies to something
  // outside this process still says, in its own log, what budget it was
  // working to.
  console.log(
    `${label}: up to ${String(attempts)} attempts of ${String(timeoutSeconds)}s against apt/dpkg; ` +
      `worst case ${String(worstCaseSeconds({ ...CLI_DEFAULTS, attempts, timeoutSeconds }))}s`
  );

  const result = await retryWithLockClear({
    attempts,
    run: runAttempt,
    isLockHeld,
    killStaleHolders,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    backoffMs: CLI_DEFAULTS.backoffMs,
    lockPollMs: CLI_DEFAULTS.lockPollMs,
    maxLockWaitPolls: CLI_DEFAULTS.maxLockWaitPolls,
    onEvent: (event) => {
      if (event.type === 'attempt-failed') {
        console.log(
          `::warning::${label} attempt ${event.attempt} failed or stalled; ` +
            'killing stale holders and waiting for the lock to clear before retrying'
        );
      } else if (event.type === 'lock-wait-exhausted') {
        console.log(`::warning::${label}: lock still held after the bounded wait; retrying anyway`);
      }
    },
  });

  if (!result.success) {
    console.error(
      `::error::${label} failed after ${attempts} bounded attempts; a slow mirror or a dpkg lock ` +
        'held by another process are the usual causes'
    );
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  cliMain().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
