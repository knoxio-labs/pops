/**
 * What the design playground may see of this app package.
 *
 * `pillars/design` draws the POPS web chrome around a screen it is
 * reviewing, and draws it from the real nav config rather than a copy — so a
 * rail item added here shows up there without anyone remembering to mirror
 * it. Kept apart from `index.ts` because that entry registers search result
 * components as a side effect, which the playground has no use for.
 */
export { navConfig } from './nav';

/**
 * One presentational section, reachable so a playground screen can compose
 * the real component instead of a look-alike. The bar for adding to this
 * list is that the component takes its whole world through props: no query,
 * no store, no client. Anything else belongs behind a route, not here.
 */
export { ImportWarningBanner } from './components/imports/ImportWarningBanner';
