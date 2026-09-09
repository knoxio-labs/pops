/**
 * The ESM entry the shell's runtime loader imports.
 *
 * `pillars/shell/src/app/external-ui.tsx` `import()`s the URL this pillar
 * advertises as `assetsBaseUrl` and reads one export off the module
 * namespace: `bundles`. Nothing else here is part of that contract, which is
 * why this is not `./index`.
 */
export { bundles } from './bundles';
