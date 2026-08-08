#!/usr/bin/env node
/**
 * Runtime smoke test for one pillar image: start the built container and
 * require it to answer its health route.
 *
 * A build-only gate cannot catch the class of bug this exists for. `pnpm
 * deploy --legacy` under pnpm 11 writes relative `@pops/*` symlinks that
 * escape the deploy directory: the build succeeds, the image exports clean,
 * and the container dies on its first import with ERR_MODULE_NOT_FOUND.
 * Nothing short of starting the image sees it.
 *
 * How to reach the image is derived from the Dockerfile itself — the
 * published port from `EXPOSE`, the health route from the runtime stage's
 * base image — so a new pillar is covered the moment its Dockerfile lands,
 * with no port or route table to keep in sync.
 *
 * The image is started against a NAMED VOLUME THAT HAS NEVER EXISTED, mounted
 * where production mounts one. Docker seeds an empty named volume from the
 * image's contents at the mount point, ownership included, so a runtime stage
 * that does not create and own that directory gets a `root:root` volume and
 * dies on `SQLITE_CANTOPEN`. A recycled volume already carries whatever
 * permissions the first mount established and would pass regardless — the
 * volume being new on every run is the whole assertion.
 *
 * The environment supplied is deliberately minimal and is documented on the
 * constants below: `PORT` and placeholders for the secrets some pillars
 * choose to crash on at boot. Nothing else — in particular no database path,
 * because each image now defaults its own onto the mount. A pillar that needs
 * more than that to answer a health probe is a finding, not a smoke-test
 * configuration problem.
 *
 * Usage:
 *   node scripts/ci/smoke-image.mjs <dockerfile> <image-ref>
 *
 * Exit 0 = the image answered its health route. Exit 1 = it did not.
 * Exit 2 = usage error.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const HEALTH_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;

/**
 * Where every pillar's SQLite volume is mounted, in compose and here alike.
 *
 * Mounted for EVERY image rather than only the DB-owning ones, so there is no
 * list of which pillars have a database to keep in sync. An image that never
 * writes there is unaffected by an extra empty volume; an image that does is
 * held to the fresh-mount contract. Each of those images defaults its own
 * database onto this path in its runtime stage — the Dockerfile of any pillar
 * that ships a `migrations/` directory, held to it by the drift test in
 * `scripts/ci/__tests__/smoke-image.test.ts`.
 */
const SMOKE_DATA_MOUNT = '/data/sqlite';

/**
 * Secrets a pillar deliberately crashes on at boot rather than discovering
 * missing at request time — see the header comment on
 * `pillars/bfm/src/api/server.ts`, which spells out that bargain. Each is
 * used only to sign or authenticate traffic the smoke never sends, so a
 * placeholder satisfies the boot check without weakening what is asserted.
 *
 * This is the one hand-maintained list here, and it stays honest by failing
 * loudly: a pillar that grows a new boot-required secret turns its smoke red
 * with the exact env var named in the crash, which is the signal to add it.
 * Resist putting anything else in here — ports, paths, feature flags and
 * per-pillar tuning belong in the image's own defaults, not in the harness.
 */
const BOOT_PLACEHOLDER_SECRETS = {
  POPS_INTERNAL_API_KEY: 'ci-smoke-placeholder',
  BFM_ACCESS_TOKEN_SECRET: 'ci-smoke-placeholder-access-token-secret',
};

/**
 * The port the runtime stage publishes.
 *
 * @param {string} dockerfile Dockerfile contents.
 * @returns {number} The single exposed port.
 * @throws {Error} When the Dockerfile exposes no port, or more than one
 *   (which would make "the" health port ambiguous — say so rather than guess).
 */
export function parseExposedPort(dockerfile) {
  const ports = [
    ...new Set([...dockerfile.matchAll(/^\s*EXPOSE\s+(\d+)/gimu)].map((match) => Number(match[1]))),
  ];
  if (ports.length === 0) {
    throw new Error('no EXPOSE directive — cannot tell which port to health-check');
  }
  if (ports.length > 1) {
    throw new Error(`ambiguous: ${ports.length} distinct EXPOSE ports (${ports.join(', ')})`);
  }
  return ports[0];
}

/**
 * The final stage's text: from its `FROM` to the end of the file.
 *
 * Only this stage ships. A directory created or owned in the builder is
 * discarded with it, so anything asserted about what the running image
 * contains has to be asserted here and not on the file as a whole.
 *
 * @param {string} dockerfile Dockerfile contents.
 * @returns {string}
 * @throws {Error} When the Dockerfile has no FROM.
 */
export function runtimeStage(dockerfile) {
  const froms = [...dockerfile.matchAll(/^\s*FROM\s+\S+/gimu)];
  const last = froms.at(-1);
  if (last?.index === undefined) throw new Error('no FROM directive — not a Dockerfile?');
  return dockerfile.slice(last.index);
}

/**
 * The base image of the final (runtime) stage.
 *
 * @param {string} dockerfile Dockerfile contents.
 * @returns {string} e.g. `node:24-slim`, `nginx:1.31.3-alpine`.
 * @throws {Error} When the Dockerfile has no FROM.
 */
export function parseRuntimeBaseImage(dockerfile) {
  const base = /^\s*FROM\s+(\S+)/imu.exec(runtimeStage(dockerfile))?.[1];
  if (base === undefined) throw new Error('no FROM directive — not a Dockerfile?');
  return base;
}

/**
 * The liveness route an image serves, by runtime base image.
 *
 * Application pillars answer the SDK's `/health` (see
 * `libs/sdk/src/bootstrap/health-route.ts`). The nginx-served pillars
 * (`docs`, `shell`) are probed at `/` instead, matching what the production
 * compose healthcheck asks of the shell: its `/health` location is a REVERSE
 * PROXY to the registry, so probing it would assert a sibling pillar is up
 * rather than that this image boots.
 *
 * @param {string} baseImage Runtime stage base image.
 * @returns {string} Absolute liveness path.
 */
export function resolveHealthPath(baseImage) {
  return /^nginx(:|$)/u.test(baseImage) ? '/' : '/health';
}

/**
 * A volume name no previous run can have used.
 *
 * The pillar id is in there for a human reading `docker volume ls` after a
 * crashed run; the random suffix is what makes the mount genuinely first-ever.
 * Deriving the name from the Dockerfile path alone would recycle it across
 * runs on the same machine, and a recycled volume already carries the
 * ownership the fix installs — it would pass on an image that has regressed.
 *
 * @param {string} dockerfilePath e.g. `pillars/finance/Dockerfile`.
 * @returns {string}
 */
export function freshVolumeName(dockerfilePath) {
  const pillarId = basename(dirname(dockerfilePath)) || 'pillar';
  return `pops-smoke-${pillarId}-${randomUUID().slice(0, 8)}`;
}

/**
 * @param {string} dockerfile Dockerfile contents.
 * @returns {{ port: number, healthPath: string, baseImage: string }}
 */
export function planSmoke(dockerfile) {
  const baseImage = parseRuntimeBaseImage(dockerfile);
  return {
    port: parseExposedPort(dockerfile),
    healthPath: resolveHealthPath(baseImage),
    baseImage,
  };
}

/**
 * @param {readonly string[]} args docker CLI arguments.
 * @returns {Promise<string>} Trimmed stdout.
 */
async function docker(args) {
  const { stdout } = await execFileAsync('docker', [...args], { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

/**
 * Run docker for its output, never for its exit code. Used on the diagnostic
 * paths, where a failing command's own output is the thing worth printing —
 * so a rejection surrenders its captured streams too, not just the
 * `Command failed: …` message wrapping them.
 *
 * @param {readonly string[]} args docker CLI arguments.
 * @returns {Promise<string>} Combined output, or the failure text.
 */
async function dockerBestEffort(args) {
  try {
    const { stdout, stderr } = await execFileAsync('docker', [...args], {
      maxBuffer: 32 * 1024 * 1024,
    });
    return `${stdout}${stderr}`;
  } catch (err) {
    const captured = collectStreams(err);
    if (captured !== '') return captured;
    return err instanceof Error ? err.message : String(err);
  }
}

/**
 * The `stdout`/`stderr` Node attaches to a failed `execFile` rejection.
 *
 * @param {unknown} err
 * @returns {string} Both streams concatenated, or `''` when neither is present.
 */
export function collectStreams(err) {
  if (typeof err !== 'object' || err === null) return '';
  const { stdout, stderr } = /** @type {{ stdout?: unknown, stderr?: unknown }} */ (err);
  const parts = [stdout, stderr].filter((part) => typeof part === 'string' && part !== '');
  return parts.join('');
}

/**
 * Resolve the ephemeral host port Docker bound the container port to.
 *
 * @param {string} containerId
 * @param {number} containerPort
 * @returns {Promise<number>}
 */
async function resolveHostPort(containerId, containerPort) {
  const mapping = await docker(['port', containerId, String(containerPort)]);
  const port = Number(mapping.split('\n')[0]?.split(':').at(-1));
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`could not resolve host port from 'docker port' output: ${mapping}`);
  }
  return port;
}

/**
 * @param {string} containerId
 * @returns {Promise<boolean>} Whether the container is still running.
 */
async function isRunning(containerId) {
  const state = await dockerBestEffort(['inspect', '-f', '{{.State.Running}}', containerId]);
  return state.trim() === 'true';
}

/**
 * Poll the health route until it answers 2xx, the container exits, or the
 * budget runs out.
 *
 * @param {object} args
 * @param {string} args.containerId
 * @param {string} args.url
 * @param {number} args.timeoutMs
 * @returns {Promise<{ ok: true, body: string } | { ok: false, reason: string }>}
 */
async function waitForHealth({ containerId, url, timeoutMs }) {
  const deadline = Date.now() + timeoutMs;
  /** @type {string} */
  let lastError = 'never attempted';
  while (Date.now() < deadline) {
    if (!(await isRunning(containerId))) {
      return { ok: false, reason: 'the container exited before serving its health route' };
    }
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
      const body = (await response.text()).slice(0, 500);
      if (response.ok) return { ok: true, body };
      lastError = `HTTP ${response.status}: ${body}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, reason: `timed out after ${timeoutMs}ms; last attempt: ${lastError}` };
}

/**
 * Dump everything a reader needs to diagnose the failure without a local
 * rebuild — the `@pops/*` link shape, which is what breaks when the deploy
 * step regresses to a workspace-escaping symlink, and the numeric ownership
 * of the data directory IN THE IMAGE, which is what a fresh volume inherits.
 * `0 0` there against a `USER node` runtime is the whole of a SQLITE_CANTOPEN.
 *
 * @param {string} containerId
 * @param {string} image
 * @returns {Promise<void>}
 */
async function reportFailure(containerId, image) {
  console.error('\n--- container logs ---');
  console.error(await dockerBestEffort(['logs', containerId]));
  console.error('\n--- /app/node_modules/@pops (workspace link shape) ---');
  console.error(
    await dockerBestEffort([
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      image,
      '-c',
      'ls -la /app/node_modules/@pops 2>&1 || echo "(no /app/node_modules/@pops)"',
    ])
  );
  console.error(`\n--- ${SMOKE_DATA_MOUNT} in the image (uid/gid a fresh volume inherits) ---`);
  console.error(
    await dockerBestEffort([
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      image,
      '-c',
      `ls -ldn /data ${SMOKE_DATA_MOUNT} 2>&1; id`,
    ])
  );
}

async function main() {
  const [dockerfilePath, image] = process.argv.slice(2);
  if (dockerfilePath === undefined || image === undefined) {
    console.error('Usage: node scripts/ci/smoke-image.mjs <dockerfile> <image-ref>');
    process.exit(2);
  }

  const { port, healthPath, baseImage } = planSmoke(readFileSync(dockerfilePath, 'utf8'));
  const volume = freshVolumeName(dockerfilePath);
  console.log(
    `Smoking ${image} (${dockerfilePath}): runtime base ${baseImage}, ` +
      `expecting ${healthPath} on container port ${port}, ` +
      `with the never-before-mounted volume ${volume} at ${SMOKE_DATA_MOUNT}.`
  );

  await docker(['volume', 'create', volume]);
  try {
    // Deliberately NOT `--rm`: a container that dies on its first import is
    // exactly the failure this exists to catch, and its logs are the evidence.
    // `--rm` would delete them the instant it exited.
    const containerId = await docker([
      'run',
      '--detach',
      '--publish',
      `127.0.0.1::${port}`,
      '--volume',
      `${volume}:${SMOKE_DATA_MOUNT}`,
      '--env',
      `PORT=${port}`,
      ...Object.entries(BOOT_PLACEHOLDER_SECRETS).flatMap(([name, value]) => [
        '--env',
        `${name}=${value}`,
      ]),
      image,
    ]);

    try {
      // An image that dies on its first import is gone before `docker port`
      // can answer, so a failure here is a smoke failure like any other — it
      // must still surface the logs rather than throw a raw docker error.
      const result = await resolveHostPort(containerId, port).then(
        (hostPort) =>
          waitForHealth({
            containerId,
            url: `http://127.0.0.1:${hostPort}${healthPath}`,
            timeoutMs: HEALTH_TIMEOUT_MS,
          }),
        (err) => ({
          ok: /** @type {const} */ (false),
          reason: `could not reach the published port: ${err instanceof Error ? err.message : String(err)}`,
        })
      );
      if (result.ok) {
        console.log(`OK — ${image} answered ${healthPath}: ${result.body}`);
        return;
      }
      console.error(`FAIL — ${image} never answered ${healthPath}: ${result.reason}`);
      await reportFailure(containerId, image);
      process.exitCode = 1;
    } finally {
      await dockerBestEffort(['rm', '--force', containerId]);
    }
  } finally {
    // After the container, never before: a volume still in use will not go.
    await dockerBestEffort(['volume', 'rm', '--force', volume]);
  }
}

if (process.argv[1]?.endsWith('smoke-image.mjs')) {
  try {
    await main();
  } catch (err) {
    console.error(`FAIL — ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
