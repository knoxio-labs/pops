/**
 * The capability a type grants so its items can be assemblies (Inventory
 * ADR-001, "Assemblies and parts"). It changes no stored item state, so
 * granting or removing it on a published type needs no migration.
 */
export const PARTS_CAPABILITY = 'parts';
