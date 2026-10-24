import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';

/**
 * List tracked and untracked, non-ignored files, optionally limited to pathspecs.
 * Deleted tracked files stay listed so their absence is part of a fingerprint.
 * @param {string} cwd
 * @param {readonly string[]} [pathspecs]
 * @returns {string[]}
 */
export function listRepositoryFiles(cwd, pathspecs = []) {
  const listed = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z', '--', ...pathspecs],
    { cwd, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
  );
  return [...new Set(listed.split('\0').filter(Boolean))].toSorted();
}

/**
 * Add one repository file's path, mode and content to a digest. Environment
 * files contribute metadata only, so their values never enter a fingerprint.
 * @param {import('node:crypto').Hash} hash
 * @param {string} cwd
 * @param {string} file
 */
export function addRepositoryFile(hash, cwd, file) {
  hash.update(file);
  const absolute = join(cwd, file);
  if (!existsSync(absolute)) {
    hash.update('missing');
    return;
  }
  const stat = lstatSync(absolute);
  hash.update(String(stat.mode));
  if (stat.isSymbolicLink()) {
    hash.update(readlinkSync(absolute));
    return;
  }
  if (!stat.isFile()) return;
  if (/(^|\/)\.env(?:\.|$)/u.test(file))
    hash.update(JSON.stringify([stat.size, stat.mtimeMs, stat.ctimeMs]));
  else hash.update(readFileSync(absolute));
}

/**
 * Snapshot tracked and untracked source independently of generated build output.
 * This detects edits during planning or prerequisite builds, before checks start.
 * @param {string} cwd
 * @returns {string}
 */
export function repositoryFingerprint(cwd) {
  const hash = createHash('sha256');
  for (const file of listRepositoryFiles(cwd)) addRepositoryFile(hash, cwd, file);
  return hash.digest('hex');
}
