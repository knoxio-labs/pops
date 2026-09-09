/**
 * @pops/app-purchases — frontend entrypoint.
 *
 * Exposes the module manifest, navConfig, and route table consumed by the
 * shell. Talks to the purchases pillar over its REST contract via the
 * generated client in `./purchases-api`.
 *
 * `bundles` is the same page surface addressed the other way: the shell's
 * static bundle map mounts `routes`, while its runtime loader resolves a
 * `PageDescriptor.bundleSlot` against `bundles`. Both are derived from one
 * table (`./routes`), so the two mount paths cannot disagree.
 */
export { bundles } from './bundles';
export { manifest } from './manifest';
export { navConfig, routes } from './routes';
