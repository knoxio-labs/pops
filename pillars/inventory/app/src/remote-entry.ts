/**
 * The ESM entry the shell's runtime loader imports.
 *
 * `pillars/shell/src/app/external-ui.tsx` `import()`s the URL this pillar
 * advertises as `assetsBaseUrl` and reads two exports off the module
 * namespace: `bundles`, and `i18n`, which it registers with the shell's
 * i18next instance before mounting a page. Nothing else here is part of that
 * contract, which is why this is not `./index`.
 */
export { bundles } from './bundles';
export { i18n } from './locales';
