import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Snapshot tracked and untracked source independently of generated build output.
 * This detects edits during planning or prerequisite builds, before checks start.
 * @param {string} cwd
 * @returns {string}
 */
export function repositoryFingerprint(cwd) {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  const hash = createHash('sha256');
  for (const file of [...new Set(listed.split('\0').filter(Boolean))].toSorted()) {
    hash.update(file);
    const absolute = join(cwd, file);
    if (!existsSync(absolute)) {
      hash.update('missing');
      continue;
    }
    const stat = lstatSync(absolute);
    hash.update(String(stat.mode));
    if (stat.isSymbolicLink()) {
      hash.update(readlinkSync(absolute));
      continue;
    }
    if (!stat.isFile()) continue;
    if (/(^|\/)\.env(?:\.|$)/u.test(file))
      hash.update(JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs]));
    else hash.update(readFileSync(absolute));
  }
  return hash.digest('hex');
}
