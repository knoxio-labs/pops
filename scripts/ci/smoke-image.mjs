#!/usr/bin/env node
/**
 * Runtime smoke test for one pillar image: start the built container on
 * never-before-mounted volumes, require it to answer its health route, and
 * require its runtime user to be able to write to every data mount.
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
 * WHERE it is mounted is derived the same way, from `infra/docker-compose.yml`
 * — the actual production deploy target — rather than from a table here. Every
 * read-write `/data/...` volume a compose service declares for this Dockerfile
 * gets a NAMED VOLUME THAT HAS NEVER EXISTED. Docker seeds an empty named
 * volume from the image's contents at the mount point, ownership included, so
 * a runtime stage that does not create and own that directory gets a
 * `root:root` volume. The database mount dies on that at boot
 * (`SQLITE_CANTOPEN`); a second data volume — media images, food ingest,
 * cerebrum engrams — is written lazily and boots fine regardless, which is why
 * every mount also gets an explicit write as the runtime user rather than
 * being left to the health probe to notice. A recycled volume already carries
 * whatever permissions the first mount established and would pass regardless —
 * the volumes being new on every run is the whole assertion.
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
 * writable. Exit 1 = one of those was not true. Exit 2 = usage error.
 */

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { load as parseYaml } from 'js-yaml';

import { ComposeFileSchema } from './compose-schema.mjs';

const execFileAsync = promisify(execFile);

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** The production deploy target, and the only source of the mount set. */
const COMPOSE_PATH = join(repoRoot, 'infra', 'docker-compose.yml');

const HEALTH_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_000;

/** The container-side prefix under which pillars keep persistent state. */
const DATA_ROOT = '/data';

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
 * Whether a short-form volume's source names a path on the host rather than a
 * Docker volume.
 *
 * A bind is never seeded from the image, so the ownership a fresh named volume
 * inherits — the thing this harness exists to assert — says nothing about it.
 * Mounting a fresh volume where production binds a host directory would demand
 * a `chown` the image genuinely does not need.
 *
 * @param {string} source Short-form source segment, `''` for an anonymous volume.
 * @returns {boolean}
 */
function isHostPath(source) {
  return source !== '' && (/^[.~/]/u.test(source) || /^[A-Za-z]:[\\/]/u.test(source));
}

/**
 * Normalize one `volumes:` list entry to the container-side path it mounts
 * onto and how, regardless of which of Compose's two equivalent forms declared
 * it.
 *
 * The short form is parsed FROM THE RIGHT. `entry.split(':')[1]` is wrong in
 * both directions Compose allows: an anonymous volume (`- /data/media/images`)
 * has no source segment at all and yields `undefined`, and a source that
 * itself contains a colon (a Windows path, a URL-ish volume name) shifts every
 * segment along so the target lands on the mode.
 *
 * @param {string | { type?: string, target: string, read_only?: boolean }} entry
 *   One `ComposeVolumeEntrySchema` value: Compose's short string form, or its
 *   long object form.
 * @returns {{ target: string, readOnly: boolean, isBind: boolean } | undefined}
 *   `undefined` when the entry declares no absolute container path, which
 *   Compose itself would also reject.
 */
export function normalizeVolumeEntry(entry) {
  if (typeof entry !== 'string') {
    return {
      target: entry.target,
      readOnly: entry.read_only === true,
      isBind: entry.type !== undefined && entry.type !== 'volume',
    };
  }
  const segments = entry.split(':');
  const modes = segments.length > 1 && !segments.at(-1)?.startsWith('/') ? segments.pop() : '';
  const target = segments.pop();
  if (target === undefined || !target.startsWith('/')) return undefined;
  return {
    target,
    readOnly: (modes ?? '').split(',').includes('ro'),
    isBind: isHostPath(segments.join(':')),
  };
}

/**
 * Compose writes `build.dockerfile` relative to the build context; CI passes
 * the same path with no `./` prefix. Compare them on equal terms.
 *
 * @param {string} path
 * @returns {string}
 */
function normalizeDockerfilePath(path) {
  return path.replace(/^\.\//u, '');
}

/**
 * Every `/data/...` path production mounts read-write for the image this
 * Dockerfile builds — the set this run mounts fresh and asserts writable.
 *
 * Read out of the compose manifest rather than listed here, because a list is
 * how the gap this closes appeared: `/data/sqlite` was the only path anyone
 * remembered, and the second volume media, food and cerebrum each carry went
 * ungated for as long as it took someone to notice. Derived, a pillar's new
 * data volume is covered the moment compose declares it, and a volume no
 * service still mounts drops out with no edit here.
 *
 * Parsed with a real YAML parser for the same reason: a hand-rolled line
 * scanner has to reimplement YAML's comment and quoting rules to stay correct,
 * and it silently drops the volumes on every line it gets wrong.
 *
 * Read-only mounts and host binds are excluded — see {@link isHostPath} for
 * why a bind is a different contract, and a `:ro` mount is not one the image
 * is ever asked to write to.
 *
 * @param {string} composeText Contents of `infra/docker-compose.yml`.
 * @param {string} dockerfilePath e.g. `pillars/media/Dockerfile`, as CI passes
 *   it: relative to the build context, which every pops service sets to the
 *   repo root.
 * @returns {string[]} Sorted and deduplicated across every service that builds
 *   this Dockerfile — `food` is built by both an API and a worker service, and
 *   the union is what the one image has to satisfy.
 * @throws {Error} When a service builds without naming its Dockerfile. Compose
 *   would infer `<context>/Dockerfile`; inferring it here means guessing at how
 *   the context resolves, and a wrong guess mounts nothing and reports success.
 *   Every pops service names it explicitly, so demand that rather than guess.
 */
export function dataMountsForDockerfile(composeText, dockerfilePath) {
  const compose = ComposeFileSchema.parse(parseYaml(composeText));
  const wanted = normalizeDockerfilePath(dockerfilePath);
  /** @type {Set<string>} */
  const targets = new Set();
  for (const [name, service] of Object.entries(compose.services)) {
    const build = service?.build;
    if (build === undefined) continue;
    const declared = typeof build === 'string' ? undefined : build.dockerfile;
    if (declared === undefined) {
      throw new Error(`compose service '${name}' builds without naming a dockerfile`);
    }
    if (normalizeDockerfilePath(declared) !== wanted) continue;
    for (const entry of service?.volumes ?? []) {
      const mount = normalizeVolumeEntry(entry);
      if (mount === undefined || mount.readOnly || mount.isBind) continue;
      if (mount.target === DATA_ROOT || mount.target.startsWith(`${DATA_ROOT}/`)) {
        targets.add(mount.target);
      }
    }
  }
  return [...targets].toSorted();
}

/**
 * A filesystem-safe fragment identifying a data mount, so a volume leaked by a
 * crashed run traces back to the mount it covered.
 *
 * @param {string} containerPath e.g. `/data/media/images`.
 * @returns {string} e.g. `media-images`.
 */
export function mountSlug(containerPath) {
  return containerPath.replace(/^\//u, '').replace(/\//gu, '-');
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
 *   volume from its database one, e.g. `data-media-images`.
 * @returns {string}
 */
export function freshVolumeName(dockerfilePath, mountTag = '') {
  const pillarId = basename(dirname(dockerfilePath)) || 'pillar';
  const tag = mountTag === '' ? '' : `-${mountTag}`;
  return `pops-smoke-${pillarId}${tag}-${randomUUID().slice(0, 8)}`;
}

/**
 * The fresh volume this run mounts at each of `mountPaths`.
 *
 * @param {string} dockerfilePath
 * @param {readonly string[]} mountPaths
 * @returns {{ path: string, name: string }[]}
 */
export function planVolumes(dockerfilePath, mountPaths) {
  return mountPaths.map((path) => ({
    path,
    name: freshVolumeName(dockerfilePath, mountSlug(path)),
  }));
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
 * Whether the runtime user can create a file at `mountPath`.
 *
 * Run INSIDE the running container with no `--user` override, so it is the
 * image's own `USER` doing the writing — exactly the question a lazy first
 * write asks in production, and the only one that catches a data volume the
 * runtime stage never chowned. Argument vectors rather than `sh -c`: nothing
 * about a path out of compose should reach a shell.
 *
 * @param {string} containerId
 * @param {string} mountPath
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
async function assertWritable(containerId, mountPath) {
  const probe = `${mountPath}/.pops-smoke-write-probe`;
  try {
    await docker(['exec', containerId, 'touch', probe]);
  } catch (err) {
    const captured = collectStreams(err).trim();
    const fallback = err instanceof Error ? err.message : String(err);
    return {
      ok: /** @type {const} */ (false),
      reason: captured === '' ? fallback : captured,
    };
  }
  await dockerBestEffort(['exec', containerId, 'rm', '-f', probe]);
  return { ok: /** @type {const} */ (true) };
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
  console.error('\n--- data mounts in the image (uid/gid a fresh volume inherits) ---');
  console.error(
    await dockerBestEffort([
      'run',
      '--rm',
      '--entrypoint',
      'sh',
      image,
      '-c',
      `ls -ldn ${[DATA_ROOT, ...mountPaths].join(' ')} 2>&1; id`,
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
  const mountPaths = dataMountsForDockerfile(readFileSync(COMPOSE_PATH, 'utf8'), dockerfilePath);
  const volumePlan = planVolumes(dockerfilePath, mountPaths);
  console.log(
    `Smoking ${image} (${dockerfilePath}): runtime base ${baseImage}, ` +
      `expecting ${healthPath} on container port ${port}, with ` +
      (volumePlan.length === 0
        ? 'no data mount declared for it in infra/docker-compose.yml.'
        : `${volumePlan.length} never-before-mounted volume(s): ` +
          `${volumePlan.map((v) => `${v.name}@${v.path}`).join(', ')}.`)
  );

  for (const { name } of volumePlan) await docker(['volume', 'create', name]);
  try {
    // Deliberately NOT `--rm`: a container that dies on its first import is
    // exactly the failure this exists to catch, and its logs are the evidence.
    // `--rm` would delete them the instant it exited.
    const containerId = await docker([
      'run',
      '--detach',
      '--publish',
      `127.0.0.1::${port}`,
      ...volumePlan.flatMap(({ name, path }) => ['--volume', `${name}:${path}`]),
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
        await reportFailure(containerId, image, mountPaths);
        process.exitCode = 1;
        return;
      }

      // The health probe only vouches for a mount the app opens eagerly at
      // boot. Every other data volume is written lazily — a root-owned one
      // boots clean here and fails on the first real write in production —
      // so each is asserted explicitly, including the database mount, which
      // costs nothing and removes the "which mounts are exempt" question.
      /** @type {{ path: string, reason: string }[]} */
      const unwritable = [];
      for (const { path } of volumePlan) {
        const write = await assertWritable(containerId, path);
        if (!write.ok) unwritable.push({ path, reason: write.reason });
      }
      if (unwritable.length > 0) {
        console.error(
          `FAIL — ${image} answered ${healthPath} but its runtime user cannot write to:`
        );
        for (const { path, reason } of unwritable) console.error(`  ${path}: ${reason}`);
        await reportFailure(containerId, image, mountPaths);
        process.exitCode = 1;
        return;
      }

      const writeSummary =
        mountPaths.length === 0
          ? ''
          : ` and can write to every data mount (${mountPaths.join(', ')})`;
      console.log(`OK — ${image} answered ${healthPath}${writeSummary}: ${result.body}`);
    } finally {
      await dockerBestEffort(['rm', '--force', containerId]);
    }
  } finally {
    // After the container, never before: a volume still in use will not go.
    for (const { name } of volumePlan) await dockerBestEffort(['volume', 'rm', '--force', name]);
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
