import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT = resolve(SCRIPT_DIR, '..', 'docker-entrypoint.sh');

/**
 * shellcheck finishes in ~20ms on an idle machine, but it is an external
 * process: under merge-group runner contention its spawn alone has exceeded
 * vitest's 5000ms default and failed the whole group (POPS-2368). The budget
 * bounds a hung binary without letting a starved runner decide the result.
 */
const SHELLCHECK_TIMEOUT_MS = 30_000;

/**
 * The boot entrypoint renders the registry-driven nginx conf (ADR-038) at
 * container start, so it is the only thing standing between a registry
 * outage and a dead shell. These guards pin the load-bearing invariants so
 * a future edit can't quietly break the "always boots" contract or the
 * supervision shape.
 */
describe('docker-entrypoint.sh', () => {
  it('declares a strict shell and errexit/nounset', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    expect(src.startsWith('#!/bin/sh')).toBe(true);
    expect(src).toMatch(/^set -eu$/m);
  });

  it('restores the committed static fallback on a failed boot-render', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    // The boot_render path must copy the fallback back over the served
    // conf when the rendered conf is invalid — never leave a broken render
    // in place.
    expect(src).toMatch(/cp "\$FALLBACK_CONF" "\$SERVED_CONF"/);
    // And the dynamic render must be gated by an nginx -t validation.
    expect(src).toContain('served_conf_is_valid');
  });

  it('keeps the baked fallback and warns once when POPS_OPERATOR_EMAILS is unset', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    const prepare = src.match(/prepare_fallback\(\) \{([\s\S]*?)\n\}/)?.[1];
    expect(prepare).toBeDefined();
    // The unset branch must return before anything renders or exits, so a
    // deployment without the variable boots exactly as it did before.
    const unsetBranch = prepare!.match(
      /if \[ -z "\$\{POPS_OPERATOR_EMAILS:-\}" \]; then([\s\S]*?)\n {2}fi/
    )?.[1];
    expect(unsetBranch).toBeDefined();
    expect(unsetBranch).toMatch(/warn "POPS_OPERATOR_EMAILS is unset/);
    expect(unsetBranch).toMatch(/return 0\s*$/);
    expect(unsetBranch).not.toContain('exit');
    expect(unsetBranch).not.toContain('node ');
    expect(src.match(/POPS_OPERATOR_EMAILS is unset/g)).toHaveLength(1);
  });

  it('re-renders the fallback with the guest gate before installing it, and refuses to start if that fails', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    const prepare = src.match(/prepare_fallback\(\) \{([\s\S]*?)\n\}/)?.[1];
    expect(prepare).toBeDefined();
    // Static mode (no --dynamic): the gated fallback must not need the registry.
    expect(prepare).toMatch(
      /if ! node "\$RENDER_BUNDLE" --out "\$gated"; then[\s\S]*?exit 1\n {2}fi/
    );
    expect(prepare).not.toContain('--dynamic');
    expect(prepare).toContain('cp "$gated" "$FALLBACK_CONF"');
    // And it must run before the fallback is first copied to the served path.
    const main = src.slice(src.indexOf('\nmain() {'));
    expect(main.indexOf('prepare_fallback')).toBeGreaterThanOrEqual(0);
    expect(main.indexOf('prepare_fallback')).toBeLessThan(
      main.indexOf('cp "$FALLBACK_CONF" "$SERVED_CONF"')
    );
  });

  it('reads the registry URL from POPS_REGISTRY_URL with a CORE_REGISTRY_URL fallback', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    expect(src).toMatch(/POPS_REGISTRY_URL:-\$\{CORE_REGISTRY_URL:-http:\/\/registry-api:3001\}/);
  });

  it('starts both nginx and the watcher and supervises them', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    expect(src).toMatch(/nginx -g 'daemon off;' &/);
    expect(src).toMatch(/node "\$WATCH_BUNDLE" &/);
    // Supervision must watch BOTH pids and exit when either dies.
    expect(src).toMatch(/kill -0 "\$nginx_pid"/);
    expect(src).toMatch(/kill -0 "\$watch_pid"/);
  });

  it('validates re-renders with `nginx -t` and rolls the served conf back to last-known-good on failure', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    // The watcher writes each render straight to $SERVED_CONF before testing,
    // so the override must (a) validate via plain `nginx -t` (the served conf
    // is an include fragment) and (b) restore the last-known-good copy when the
    // render is invalid, so a bad render never sits on disk.
    expect(src).toContain('POPS_NGINX_CONFIG_TEST_CMD="if nginx -t;');
    expect(src).toContain('cp \\"$SERVED_CONF\\" \\"$LAST_GOOD_CONF\\"');
    expect(src).toContain('cp \\"$LAST_GOOD_CONF\\" \\"$SERVED_CONF\\"; exit 1');
  });

  it('exits 0 on a signal-driven shutdown (docker stop / Watchtower) but non-zero when a child dies', async () => {
    const src = await readFile(ENTRYPOINT, 'utf8');
    // A clean stop must not look like a crash to the orchestrator.
    expect(src).toMatch(/trap '.*terminate; exit 0' TERM INT/);
    // A child dying on its own is still the failure path.
    expect(src).toMatch(/terminate\n {2}exit 1/);
  });

  it(
    'passes shellcheck in POSIX sh mode when shellcheck is available',
    async () => {
      try {
        await execFileAsync('shellcheck', ['-s', 'sh', ENTRYPOINT]);
      } catch (err: unknown) {
        if (isCommandNotFound(err)) return;
        const detail = err instanceof Error ? err.message : String(err);
        throw new Error(`shellcheck reported issues:\n${detail}`, { cause: err });
      }
    },
    SHELLCHECK_TIMEOUT_MS
  );
});

function isCommandNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT';
}
