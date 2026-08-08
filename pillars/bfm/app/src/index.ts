/**
 * @pops/app-bfm — frontend entrypoint.
 *
 * Exposes the module manifest, navConfig, and route table consumed by the
 * shell. Talks to the bfm pillar over its REST contract via the generated
 * client in `./bfm-api`.
 */
export { manifest } from './manifest';
export { navConfig, routes } from './routes';
