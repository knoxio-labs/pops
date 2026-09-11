/**
 * Node-only utilities with no place on the browser-consumed root barrel.
 *
 * `isCliEntrypoint` is the first resident: the "is this module the process
 * entry point" guard every pillar script needs, in exactly one spelling. See
 * `libs/sdk/README.md` for the entry-point table.
 */
export { isCliEntrypoint } from './cli-entrypoint.js';
