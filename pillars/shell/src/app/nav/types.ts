/**
 * App navigation types for the POPS shell.
 *
 * The shapes themselves live in `@pops/navigation`, beside `IconName`: they
 * are the contract between an `@pops/app-*` package and any chrome that
 * draws its nav, and the shell is no longer the only one. This module stays
 * as the shell-local name the layout imports.
 */

export type { AppNavConfig, AppNavItem, IconName } from '@pops/navigation';
