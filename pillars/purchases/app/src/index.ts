/**
 * @pops/app-purchases — frontend entrypoint.
 *
 * Exposes the module manifest, navConfig, and route table consumed by the
 * shell. Talks to the purchases pillar over its REST contract via the
 * generated client in `./purchases-api`.
 */
export { manifest } from './manifest';
export { navConfig, routes } from './routes';
