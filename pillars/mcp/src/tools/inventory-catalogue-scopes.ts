/**
 * The two inventory type-catalogue scopes MCP's tools declare (POPS-4357,
 * POPS-4362). Inventory's `type-catalogue-handlers.ts` already enforces both,
 * one per route class, via `requireAuthor(res, 'read' | 'manage')`; these
 * constants are this file's single source of truth so a tool's declared
 * `scope` and the guidance a refusal names can never drift apart.
 *
 * `inventory.types.manage` authorises draft creation, patching, preview,
 * publication and abandonment — every write to the catalogue. It does not
 * imply `inventory.types.read` (`hasScopeFor` matches by exact value or dot
 * prefix, and neither scope is a prefix of the other), so a service account
 * needs both grants to both read and author the catalogue.
 */
export const INVENTORY_TYPES_READ_SCOPE = 'inventory.types.read';
export const INVENTORY_TYPES_MANAGE_SCOPE = 'inventory.types.manage';
