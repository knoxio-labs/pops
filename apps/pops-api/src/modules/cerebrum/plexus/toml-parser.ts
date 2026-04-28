/**
 * TOML parsing utilities for plexus.toml (PRD-090, US-03).
 *
 * Pure functions for parsing adapter configuration from TOML strings.
 */
import { parse as parseToml } from 'smol-toml';

import type {
  FilterDefinition,
  FilterType,
  PlexusToml,
  PluginManifest,
  TomlAdapterConfig,
} from './types.js';

/** Parse a single raw filter entry into a typed filter object. */
function parseRawFilter(f: unknown): { type: FilterType; field: string; pattern: string } | null {
  if (!f || typeof f !== 'object') return null;
  const fObj = f as Record<string, unknown>;
  const fType = fObj['type'];
  const fField = fObj['field'];
  const fPattern = fObj['pattern'];
  if (typeof fType !== 'string' || typeof fField !== 'string' || typeof fPattern !== 'string') {
    return null;
  }
  return { type: fType as FilterType, field: fField, pattern: fPattern };
}

/** Parse the raw filters array from a TOML adapter entry. */
function parseRawFilters(rawFilters: unknown): TomlAdapterConfig['filters'] {
  if (!Array.isArray(rawFilters)) return [];
  const filters: NonNullable<TomlAdapterConfig['filters']> = [];
  for (const f of rawFilters) {
    const parsed = parseRawFilter(f);
    if (parsed) filters.push(parsed);
  }
  return filters;
}

/**
 * Parse a `plexus.toml` string into typed config.
 * Throws on malformed TOML.
 */
export function parsePlexusToml(content: string): PlexusToml {
  const raw = parseToml(content) as Record<string, unknown>;
  const adapters: Record<string, TomlAdapterConfig> = {};

  const rawAdapters = raw['adapters'] as Record<string, Record<string, unknown>> | undefined;
  if (!rawAdapters || typeof rawAdapters !== 'object') {
    return { adapters };
  }

  for (const [name, entry] of Object.entries(rawAdapters)) {
    if (!entry || typeof entry !== 'object') continue;

    adapters[name] = {
      module: typeof entry['module'] === 'string' ? entry['module'] : `builtin:${name}`,
      enabled: entry['enabled'] !== false,
      settings: (entry['settings'] as Record<string, unknown>) ?? {},
      credentials: (entry['credentials'] as Record<string, string>) ?? {},
      filters: parseRawFilters(entry['filters']),
    };
  }

  return { adapters };
}

/**
 * Build `PluginManifest` entries from parsed TOML config.
 */
export function buildManifests(toml: PlexusToml): PluginManifest[] {
  if (!toml.adapters) return [];

  return Object.entries(toml.adapters).map(([name, cfg]) => {
    const filters: FilterDefinition[] = (cfg.filters ?? []).map((f) => ({
      filterType: f.type,
      field: f.field,
      pattern: f.pattern,
    }));

    return {
      name,
      module: cfg.module,
      enabled: cfg.enabled,
      settings: cfg.settings ?? {},
      credentials: cfg.credentials ?? {},
      filters,
    };
  });
}
