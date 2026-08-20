/**
 * Shared real-tree guard proofs (ADR-045).
 *
 * ADR-045 requires every guard to ship a proof that it runs correctly against
 * the REAL tree, not a fixture. The idiomatic spelling of that is an `it` body
 * that spawns the guard as CI spawns it. Each such spawn costs the guard's
 * whole scan, and the suite now carries enough of them that they run
 * concurrently with each other and with ~65 other test files across every
 * core the machine has. Vitest's per-test budget is wall clock, so what those
 * spawns are measured against is not their own cost but their cost plus
 * however oversubscribed the machine happens to be — which is why they redden
 * in a different combination on every run of an unchanged tree.
 *
 * So the spawn is hoisted out of the test bodies entirely. Every registered
 * invocation runs exactly once per suite, concurrently, in `global-setup.ts`,
 * before any worker starts; the results are handed to the tests through
 * Vitest's `provide`/`inject`, and each `it` becomes an assertion over
 * captured output. Nothing about what is proven changes: the real guard runs
 * against the real tree in a real subprocess, and its real exit code, stdout
 * and stderr are what the assertions read. What changes is that the guard is
 * no longer racing the rest of the suite while a wall clock judges it.
 *
 * Registering a new guard here is one line, and it costs the suite one
 * concurrent process rather than another test that can time out — which
 * matters because the number of guards only ever goes up.
 */

import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

/** One real invocation of a guard against the real repository tree. */
export interface RealTreeProof {
  /** Stable key the owning test looks the result up by. */
  readonly id: string;
  /** Repo-relative path to the guard. */
  readonly script: string;
  /** Arguments, exactly as CI passes them. */
  readonly args: readonly string[];
}

/** Exactly what the guard did, captured verbatim. */
export interface RealTreeProofResult {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
}

/** Every recorded proof, keyed by {@link RealTreeProof.id}. */
export type RealTreeProofResults = Readonly<Record<string, RealTreeProofResult>>;

/**
 * The invocations run once per suite.
 *
 * `scripts/ci/check-line-budget-headroom.mjs` is deliberately absent: its
 * self-proof is being reworked separately and this registry must not collide
 * with that.
 */
export const REAL_TREE_PROOFS = [
  { id: 'check-design-tokens', script: 'scripts/ci/check-design-tokens.mjs', args: [] },
  {
    id: 'check-design-tokens:self-test',
    script: 'scripts/ci/check-design-tokens.mjs',
    args: ['--self-test'],
  },
  {
    id: 'check-icon-dynamic-import',
    script: 'scripts/ci/check-icon-dynamic-import.mjs',
    args: [],
  },
  {
    id: 'check-icon-dynamic-import:self-test',
    script: 'scripts/ci/check-icon-dynamic-import.mjs',
    args: ['--self-test'],
  },
  { id: 'check-icon-only-buttons', script: 'scripts/ci/check-icon-only-buttons.mjs', args: [] },
  {
    id: 'check-icon-only-buttons:self-test',
    script: 'scripts/ci/check-icon-only-buttons.mjs',
    args: ['--self-test'],
  },
  {
    id: 'icon-vocabulary-drift:self-test',
    script: 'scripts/ci/check-icon-vocabulary-drift.mjs',
    args: ['--self-test'],
  },
  {
    id: 'resolve-report-base:self-test',
    script: 'scripts/ci/resolve-report-base.mjs',
    args: ['--self-test'],
  },
] as const satisfies readonly RealTreeProof[];

/** Key of a registered proof. */
export type RealTreeProofId = (typeof REAL_TREE_PROOFS)[number]['id'];

/**
 * Distinguishes a guard that finished from one that wedged. The registered
 * guards cost between 0.1 s and 1.6 s of work on an idle machine, so this is
 * three orders of magnitude clear of anything contention can produce: it is a
 * deadlock detector, not a performance budget, and a guard that merely runs
 * slowly must never reach it.
 */
const HANG_DETECTOR_MS = 300_000;

/** Guard output is a few lines; this only exists so a runaway guard fails loudly. */
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * Run one guard, capturing its outcome rather than throwing on a non-zero
 * exit — a guard that reports IS the thing several of these proofs assert, so
 * the exit code is data here, not an error.
 *
 * @param proof The invocation to run.
 * @returns What the guard did.
 */
async function runProof(proof: RealTreeProof): Promise<RealTreeProofResult> {
  const scriptPath = join(repoRoot, proof.script);
  // A mistyped path would otherwise surface as an ordinary non-zero exit, and
  // "the guard reported" is a legitimate outcome here — so it would read as a
  // real finding rather than as a broken registry entry.
  if (!existsSync(scriptPath)) {
    throw new Error(`real-tree proof "${proof.id}" points at a missing script: ${proof.script}`);
  }
  return await new Promise<RealTreeProofResult>((resolvePromise, rejectPromise) => {
    execFile(
      process.execPath,
      [scriptPath, ...proof.args],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        maxBuffer: MAX_OUTPUT_BYTES,
        timeout: HANG_DETECTOR_MS,
      },
      (error, stdout, stderr) => {
        if (error === null) {
          resolvePromise({ status: 0, stdout, stderr });
          return;
        }
        if (typeof error.code === 'number') {
          resolvePromise({ status: error.code, stdout, stderr });
          return;
        }
        rejectPromise(
          new Error(
            `real-tree proof "${proof.id}" did not produce an exit code (${error.message})`,
            { cause: error }
          )
        );
      }
    );
  });
}

/**
 * Run every registered proof once, concurrently.
 *
 * @returns Each proof's outcome, keyed by id.
 */
export async function runRealTreeProofs(): Promise<RealTreeProofResults> {
  const settled = await Promise.all(
    REAL_TREE_PROOFS.map(async (proof) => [proof.id, await runProof(proof)] as const)
  );
  return Object.fromEntries(settled);
}

/**
 * Look up a recorded proof, failing loudly rather than returning `undefined`
 * if the registry and the test have drifted apart.
 *
 * @param results Everything `global-setup.ts` recorded.
 * @param id The proof the caller wants.
 * @returns That proof's outcome.
 */
export function proofOf(results: RealTreeProofResults, id: RealTreeProofId): RealTreeProofResult {
  const found = results[id];
  if (found === undefined) {
    throw new Error(
      `no real-tree proof recorded for "${id}" — every id asserted on must be listed in REAL_TREE_PROOFS`
    );
  }
  return found;
}

/**
 * Assert a guard exited 0, surfacing its own diagnostics when it did not.
 *
 * A guard that reports prints WHY to stderr; a bare `expect(status).toBe(0)`
 * would throw that away and leave the reader with `expected 1 to be 0`.
 *
 * @param results Everything `global-setup.ts` recorded.
 * @param id The proof the caller wants.
 * @returns The guard's stdout.
 */
export function passingProofStdout(results: RealTreeProofResults, id: RealTreeProofId): string {
  const { status, stdout, stderr } = proofOf(results, id);
  if (status !== 0) {
    throw new Error(
      `real-tree proof "${id}" exited ${String(status)}\n--- stdout ---\n${stdout}\n--- stderr ---\n${stderr}`
    );
  }
  return stdout;
}

declare module 'vitest' {
  interface ProvidedContext {
    realTreeProofs: RealTreeProofResults;
  }
}
