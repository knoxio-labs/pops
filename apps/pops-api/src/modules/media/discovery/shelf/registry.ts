/**
 * Shelf registry — stores all registered ShelfDefinitions.
 * Shelf implementations call registerShelf() at module load time.
 * The session assembler calls getRegisteredShelves() to discover all shelves.
 */
import type { ShelfDefinition } from "./types.js";

const _registry = new Map<string, ShelfDefinition>();

/**
 * Register a shelf definition.
 * Throws if a definition with the same id is already registered.
 */
export function registerShelf(definition: ShelfDefinition): void {
  if (_registry.has(definition.id)) {
    throw new Error(`Shelf already registered: ${definition.id}`);
  }
  _registry.set(definition.id, definition);
}

/** Returns all registered shelf definitions. */
export function getRegisteredShelves(): ShelfDefinition[] {
  return Array.from(_registry.values());
}

/** Clears all registered shelves. Used in tests only. */
export function _clearRegistry(): void {
  _registry.clear();
}
