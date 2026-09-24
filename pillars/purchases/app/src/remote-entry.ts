/**
 * The ESM entry the shell's runtime loader imports.
 *
 * `pillars/shell/src/app/external-ui.tsx` `import()`s the URL a pillar
 * advertises as `assetsBaseUrl` and reads two exports off the module
 * namespace: `bundles`, and `i18n`, which it registers with the shell's
 * i18next instance before mounting a page. Nothing else here is part of that
 * contract, which is why this file is not `./index` — the package entry also
 * carries `manifest`, `navConfig` and `routes` for the shell's static bundle
 * map, and a remote bundle has no use for any of them.
 *
 * Keeping the surface to those two also keeps the built graph honest: the
 * remote bundle contains the four page components, what they import and this
 * app's two catalogues, and nothing that exists only to satisfy the in-repo
 * mount path.
 */
export { bundles } from './bundles';
export { i18n } from './locales';
