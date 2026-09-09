/**
 * The ESM entry the shell's runtime loader imports.
 *
 * `pillars/shell/src/app/external-ui.tsx` `import()`s the URL this pillar
 * advertises as `assetsBaseUrl` and reads one export off the module namespace:
 * `bundles`. Nothing else here is part of that contract, which is why this is
 * not `./index` — the package entry also carries `manifest`, `navConfig` and
 * `routes` for the shell's static bundle map, and a remote bundle has no use
 * for any of them.
 */
export { bundles } from './bundles';
