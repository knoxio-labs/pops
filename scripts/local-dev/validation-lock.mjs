import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/**
 * Serialize validation writers within one checkout. Stale or incomplete locks
 * fail explicitly instead of racing to remove another process's replacement.
 * @template T
 * @param {string} directory
 * @param {() => Promise<T>} action
 * @returns {Promise<T>}
 */
export async function withValidationLock(directory, action) {
  mkdirSync(dirname(directory), { recursive: true });
  try {
    mkdirSync(directory);
  } catch (error) {
    if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') throw error;
    let owner;
    try {
      owner = readFileSync(join(directory, 'pid'), 'utf8');
    } catch {
      owner = 'unknown';
    }
    throw new Error(
      `local-check: validation is already running or left an incomplete lock at ${directory} (PID ${owner}). Verify the owner has stopped before removing this directory.`,
      { cause: error }
    );
  }
  const token = randomUUID();
  try {
    writeFileSync(join(directory, 'pid'), String(process.pid), { mode: 0o600 });
    writeFileSync(join(directory, 'token'), token, { mode: 0o600 });
    return await action();
  } finally {
    if (readFileSync(join(directory, 'token'), 'utf8') === token)
      rmSync(directory, { recursive: true });
  }
}
