#!/usr/bin/env node
/**
 * Runtime smoke test for one pillar image: start the built container and
 * require it to answer its health route, then require every `/data/...`
 * path its compose service mounts to be writable by the runtime user.
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
 * The image is started against NAMED VOLUMES THAT HAVE NEVER EXISTED, mounted
 * where production mounts them. Docker seeds an empty named volume from the
 * image's contents at the mount point, ownership included, so a runtime stage
 * that does not create and own that directory gets a `root:root` volume. The
 * database mount dies on that immediately (`SQLITE_CANTOPEN` at boot); a
 * second data volume (media images, food ingest, cerebrum engrams) is used
 * lazily and boots fine regardless, so it is asserted with an explicit write
 * as the runtime user rather than left to the health probe to notice. A
 * recycled volume already carries whatever permissions the first mount
 * established and would pass regardless — the volumes being new on every run
 * is the whole assertion.
 *
 * Which paths beyond the database mount to check is read out of
 * `infra/docker-compose.yml`, the actual production deploy target, rather
 * than kept as a table here: a pillar's second (or third) data volume is
 * covered the moment compose declares it, and a volume no pillar still
 * mounts drops out with no edit to this file.
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
 * Exit 0 = the image answered its health route and every data mount is
 * writable. Exit 1 = either was not true. Exit 2 = usage error.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The production compose manifest — the actual deploy target, and the
 * single source of truth this harness reads its extra data mounts from. */
const COMPOSE_PATH = join(repoRoot, 'infra', 'docker-compose.yml');

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

/** @param {string} line @returns {string} the line with a trailing `# comment` stripped. */
function stripComment(line) {
  const hash = line.indexOf('#');
  return hash === -1 ? line : line.slice(0, hash);
}

/**
 * Split a Compose manifest's top-level `services:` block into one chunk per
 * service, keyed by name, holding that service's own body lines (everything
 * indented deeper than the service key). Generic to whatever indent width the
 * file uses — a service key is recognised by being the shallowest indent seen
 * directly under `services:`, not by a fixed column.
 *
 * @param {string} composeText
 * @returns {{ name: string, lines: string[] }[]}
 */
export function parseComposeServices(composeText) {
  /** @type {{ name: string, lines: string[] }[]} */
  const services = [];
  let servicesIndent = -1;
  let serviceKeyIndent = -1;
  /** @type {{ name: string, lines: string[] } | undefined} */
  let current;

  for (const raw of composeText.split('\n')) {
    const code = stripComment(raw);
    if (code.trim() === '') continue;
    const indent = code.length - code.trimStart().length;

    if (servicesIndent === -1) {
      if (/^services\s*:\s*$/u.test(code.trim())) servicesIndent = indent;
      continue;
    }

    if (indent <= servicesIndent) break; // dedented out of `services:` for good

    if (serviceKeyIndent === -1) serviceKeyIndent = indent;

    if (indent === serviceKeyIndent) {
      const name = code
        .trim()
        .replace(/:\s*$/u, '')
        .replace(/^["']|["']$/gu, '');
      current = { name, lines: [] };
      services.push(current);
      continue;
    }

    current?.lines.push(raw);
  }

  return services;
}

/**
 * The `build.dockerfile` a service declares, if any — the join key back to
 * the Dockerfile this smoke run is testing.
 *
 * @param {readonly string[]} serviceLines
 * @returns {string | undefined}
 */
export function serviceDockerfile(serviceLines) {
  for (const raw of serviceLines) {
    const match = /^\s*dockerfile\s*:\s*(\S+)\s*$/u.exec(stripComment(raw));
    if (match?.[1] !== undefined) return match[1].replace(/^["']|["']$/gu, '');
  }
  return undefined;
}

/**
 * The container-side `/data/...` paths a service mounts read-write. A `:ro`
 * mount (the Litestream sidecars' read replica, Metabase's reporting mount)
 * is excluded — asserting write access on a mount declared read-only would
 * fail by design and prove nothing about the image.
 *
 * @param {readonly string[]} serviceLines
 * @returns {string[]}
 */
export function serviceDataVolumes(serviceLines) {
  /** @type {string[]} */
  const paths = [];
  let inVolumes = false;
  let volumesIndent = -1;

  for (const raw of serviceLines) {
    const code = stripComment(raw);
    if (code.trim() === '') continue;
    const indent = code.length - code.trimStart().length;

    if (!inVolumes) {
      if (/^volumes\s*:\s*$/u.test(code.trim())) {
        inVolumes = true;
        volumesIndent = indent;
      }
      continue;
    }

    if (indent <= volumesIndent) {
      inVolumes = false;
      continue;
    }

    const item = /^-\s*(.+?)\s*$/u.exec(code.trim());
    if (!item?.[1]) continue;
    const segments = item[1]
      .replace(/^["']|["']$/gu, '')
      .split(':')
      .map((s) => s.trim());
    const containerPath = segments[1];
    const mode = segments[2];
    if (containerPath !== undefined && containerPath.startsWith('/data/') && mode !== 'ro') {
      paths.push(containerPath);
    }
  }

  return paths;
}

/**
 * Every `/data/...` path any compose service mounts read-write for the given
 * Dockerfile, beyond the database mount every image already gets — the set
 * this smoke run additionally asserts writable.
 *
 * @param {string} composeText
 * @param {string} dockerfilePath e.g. `pillars/media/Dockerfile`, matched
 *   against compose's `build.dockerfile` exactly as CI passes it (relative to
 *   repo root, no leading `./`).
 * @returns {string[]} Sorted, deduplicated, excluding {@link SMOKE_DATA_MOUNT}.
 */
export function extraDataMountsForDockerfile(composeText, dockerfilePath) {
  const paths = new Set();
  for (const service of parseComposeServices(composeText)) {
    if (serviceDockerfile(service.lines) !== dockerfilePath) continue;
    for (const path of serviceDataVolumes(service.lines)) paths.add(path);
  }
  paths.delete(SMOKE_DATA_MOUNT);
  return [...paths].toSorted();
}

/**
 * A filesystem-safe fragment identifying a data mount path, for volume names
 * a human reading `docker volume ls` can trace back to the mount they cover.
 *
 * @param {string} containerPath e.g. `/data/media/images`.
 * @returns {string} e.g. `media-images`.
 */
export function mountSlug(containerPath) {
  return containerPath.replace(/^\/data\//u, '').replace(/\//gu, '-');
}

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
 * @param {string} [mountTag] Distinguishes a pillar's second (or third) data
 *   volume from its database one in `docker volume ls`, e.g. `media-images`.
 * @returns {string}
 */
export function freshVolumeName(dockerfilePath, mountTag = '') {
  const pillarId = basename(dirname(dockerfilePath)) || 'pillar';
  const tag = mountTag === '' ? '' : `-${mountTag}`;
  return `pops-smoke-${pillarId}${tag}-${randomUUID().slice(0, 8)}`;
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
 * Attempt to create and remove a probe file at `mountPath`, run INSIDE the
 * running container with no `--user` override — `docker exec` defaults to
 * the image's own `USER`, so this is exactly "can the runtime user write
 * here", the same question a lazy first write in production would ask.
 *
 * @param {string} containerId
 * @param {string} mountPath
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function assertWritable(containerId, mountPath) {
  const probe = `${mountPath}/.pops-smoke-write-probe`;
  try {
    await docker(['exec', containerId, 'sh', '-c', `: > '${probe}' && rm -f '${probe}'`]);
    return { ok: true };
  } catch (err) {
    const captured = collectStreams(err);
    if (captured !== '') return { ok: /** @type {const} */ (false), reason: captured };
    return {
      ok: /** @type {const} */ (false),
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Dump everything a reader needs to diagnose the failure without a local
 * rebuild — the `@pops/*` link shape, which is what breaks when the deploy
 * step regresses to a workspace-escaping symlink, and the numeric ownership
 * of every data directory IN THE IMAGE, which is what a fresh volume
 * inherits. `0 0` there against a `USER node` runtime is the whole of a
 * SQLITE_CANTOPEN or an unwritable second data mount.
 *
 * @param {string} containerId
 * @param {string} image
 * @param {readonly string[]} mountPaths Every `/data/...` path this run mounted.
 * @returns {Promise<void>}
 */
async function reportFailure(containerId, image, mountPaths) {
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
  console.error(`\n--- data mounts in the image (uid/gid a fresh volume inherits) ---`);
  console.error(
    await dockerBestEffort([
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      image,
      '-c',
      `ls -ldn /data ${mountPaths.join(' ')} 2>&1; id`,
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
  const composeText = readFileSync(COMPOSE_PATH, 'utf8');
  const extraMounts = extraDataMountsForDockerfile(composeText, dockerfilePath);

  const volumePlan = [
    { path: SMOKE_DATA_MOUNT, name: freshVolumeName(dockerfilePath) },
    ...extraMounts.map((path) => ({
      path,
      name: freshVolumeName(dockerfilePath, mountSlug(path)),
    })),
  ];

  console.log(
    `Smoking ${image} (${dockerfilePath}): runtime base ${baseImage}, ` +
      `expecting ${healthPath} on container port ${port}, with ${volumePlan.length} ` +
      `never-before-mounted volume(s): ${volumePlan.map((v) => `${v.name}@${v.path}`).join(', ')}.`
  );

  for (const v of volumePlan) await docker(['volume', 'create', v.name]);
  try {
    // Deliberately NOT `--rm`: a container that dies on its first import is
    // exactly the failure this exists to catch, and its logs are the evidence.
    // `--rm` would delete them the instant it exited.
    const containerId = await docker([
      'run',
      '--detach',
      '--publish',
      `127.0.0.1::${port}`,
      ...volumePlan.flatMap((v) => ['--volume', `${v.name}:${v.path}`]),
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
      if (!result.ok) {
        console.error(`FAIL — ${image} never answered ${healthPath}: ${result.reason}`);
        await reportFailure(
          containerId,
          image,
          volumePlan.map((v) => v.path)
        );
        process.exitCode = 1;
        return;
      }

      // The health probe only proves the database mount is writable — the
      // app opens it eagerly at boot. A second data volume (media images,
      // food ingest, cerebrum engrams) is written lazily, so a container
      // that boots fine on a root-owned mount would sail through the probe
      // above and only fail in production, on its first real write.
      /** @type {{ path: string, reason: string }[]} */
      const unwritable = [];
      for (const v of volumePlan) {
        const write = await assertWritable(containerId, v.path);
        if (!write.ok) unwritable.push({ path: v.path, reason: write.reason });
      }
      if (unwritable.length > 0) {
        console.error(
          `FAIL — ${image} answered ${healthPath} but the runtime user cannot write to:`
        );
        for (const { path, reason } of unwritable) console.error(`  ${path}: ${reason}`);
        await reportFailure(
          containerId,
          image,
          volumePlan.map((v) => v.path)
        );
        process.exitCode = 1;
        return;
      }

      console.log(
        `OK — ${image} answered ${healthPath} and the runtime user can write to every data ` +
          `mount (${volumePlan.map((v) => v.path).join(', ')}): ${result.body}`
      );
    } finally {
      await dockerBestEffort(['rm', '--force', containerId]);
    }
  } finally {
    // After the container, never before: a volume still in use will not go.
    for (const v of volumePlan) await dockerBestEffort(['volume', 'rm', '--force', v.name]);
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
