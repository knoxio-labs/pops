#!/usr/bin/env node
/**
 * Runs an image build, and retries it only when it failed for a reason that is
 * not the image's fault.
 *
 * Publish Images had no retry. A registry `5xx` resolving a base image, or
 * BuildKit losing a blob it had just pulled, failed that one matrix leg while
 * every other image published, and the fleet stayed on mixed revisions until
 * the next push to `main` happened to rebuild it (POPS-3425). Retrying every
 * failure would fix that and hide real ones: a failed `RUN`, a type error or a
 * missing file must still fail on the first attempt. So the retry is decided by
 * what the build printed, against signatures that only infrastructure produces.
 *
 * `run` and `sleep` are injected so the orchestration is driven by fakes in
 * `__tests__/docker-build-retry.test.ts`; the CLI at the bottom spawns the real
 * command. No third-party import: `publish-images.yml` installs nothing before
 * it runs this (ADR-045, Tier A).
 */

/**
 * Output that only an infrastructure fault produces. Each is matched against
 * the build's combined output, case-insensitively.
 *
 * - a registry answering `5xx` while BuildKit resolves an image's metadata —
 *   `failed to resolve source metadata for docker.io/library/node:24-alpine:
 *   … 502 Bad Gateway`;
 * - BuildKit's content store losing a layer mid-build — `unknown blob`.
 */
export const TRANSIENT_SIGNATURES = [
  /failed to resolve source metadata for [^\n]*\b5\d\d\b/iu,
  /\bunknown blob\b/iu,
];

/**
 * Whether a failed build's output names an infrastructure fault rather than a
 * defect in the image. False for anything else, including empty output.
 *
 * @param {string} output
 * @returns {boolean}
 */
export function isTransientBuildFailure(output) {
  return TRANSIENT_SIGNATURES.some((signature) => signature.test(output));
}

/**
 * Run a build up to `attempts` times, retrying only a transient failure.
 *
 * @param {object} opts
 * @param {number} opts.attempts Total bounded attempts.
 * @param {(attempt: number) => Promise<{ ok: boolean; output: string }>} opts.run
 * @param {(ms: number) => Promise<void>} opts.sleep
 * @param {(attempt: number) => number} opts.backoffMs
 * @param {(event: { type: 'retrying' | 'not-transient' | 'exhausted'; attempt: number }) => void} [opts.onEvent]
 * @returns {Promise<{ success: boolean; attempt: number; transient: boolean }>}
 */
export async function buildWithTransientRetry({
  attempts,
  run,
  sleep,
  backoffMs,
  onEvent = () => {},
}) {
  if (attempts < 1) throw new RangeError('attempts must be >= 1');

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const { ok, output } = await run(attempt);
    if (ok) return { success: true, attempt, transient: false };

    if (!isTransientBuildFailure(output)) {
      onEvent({ type: 'not-transient', attempt });
      return { success: false, attempt, transient: false };
    }
    if (attempt === attempts) {
      onEvent({ type: 'exhausted', attempt });
      return { success: false, attempt, transient: true };
    }
    onEvent({ type: 'retrying', attempt });
    await sleep(backoffMs(attempt));
  }

  return { success: false, attempt: attempts, transient: true };
}

/** What the CLI runs with when a flag is absent. */
export const CLI_DEFAULTS = {
  attempts: 3,
  /** @param {number} attempt */
  backoffMs: (attempt) => attempt * 30_000,
};

async function cliMain() {
  const { spawn } = await import('node:child_process');

  const argv = process.argv.slice(2);
  const dashDash = argv.indexOf('--');
  const [commandBin, ...commandArgs] = dashDash === -1 ? [] : argv.slice(dashDash + 1);
  if (commandBin === undefined) {
    console.error(
      'usage: docker-build-retry.mjs [--attempts N] [--label STRING] -- <command> [args...]'
    );
    process.exit(2);
  }
  const flags = argv.slice(0, dashDash);
  /**
   * @param {string} name
   * @param {string} fallback
   */
  const flagValue = (name, fallback) => {
    const i = flags.indexOf(name);
    return i === -1 ? fallback : (flags[i + 1] ?? fallback);
  };
  const attempts = Number(flagValue('--attempts', String(CLI_DEFAULTS.attempts)));
  const label = flagValue('--label', commandBin);

  /** @returns {Promise<{ ok: boolean; output: string }>} */
  const runAttempt = () =>
    new Promise((resolve) => {
      const child = spawn(commandBin, commandArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (chunk) => {
        process.stdout.write(chunk);
        output += String(chunk);
      });
      child.stderr.on('data', (chunk) => {
        process.stderr.write(chunk);
        output += String(chunk);
      });
      child.on('close', (code) => resolve({ ok: code === 0, output }));
      child.on('error', (error) => resolve({ ok: false, output: `${output}\n${error.message}` }));
    });

  const result = await buildWithTransientRetry({
    attempts,
    run: runAttempt,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    backoffMs: CLI_DEFAULTS.backoffMs,
    onEvent: (event) => {
      if (event.type === 'retrying') {
        console.log(
          `::warning::${label} attempt ${event.attempt} hit a transient registry or BuildKit error; retrying`
        );
      }
    },
  });

  if (!result.success) {
    console.error(
      result.transient
        ? `::error::${label} failed ${attempts} times on transient registry or BuildKit errors`
        : `::error::${label} failed on attempt ${result.attempt}, not a transient error, so it was not retried`
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
