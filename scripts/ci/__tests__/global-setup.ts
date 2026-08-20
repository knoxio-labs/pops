/**
 * Runs every registered real-tree guard proof once, before any worker starts,
 * and hands the results to the suite. See `real-tree-proofs.ts` for why the
 * spawns live here rather than inside the tests that assert on them.
 */

import { runRealTreeProofs } from './real-tree-proofs.js';

import type { TestProject } from 'vitest/node';

/**
 * @param project The root test project.
 */
export default async function setup(project: TestProject): Promise<void> {
  project.provide('realTreeProofs', await runRealTreeProofs());
}
