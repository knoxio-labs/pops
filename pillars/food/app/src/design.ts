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
