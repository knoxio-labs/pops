/**
 * Plexus plugin registry (PRD-090, US-03).
 *
 * Watches `plexus.toml`, resolves credentials from environment variables,
 * and reconciles adapter state on file changes.
 */
import { existsSync, readFileSync, watch } from 'node:fs';
import { join } from 'node:path';

import { getEngramRoot } from '../instance.js';
import { buildManifests, parsePlexusToml } from './toml-parser.js';

import type { PlexusAdapterInterface } from './adapter.js';
import type { PlexusLifecycleManager } from './lifecycle.js';
import type { PluginManifest } from './types.js';

/**
 * Resolve a credential value. Values prefixed with `env:` are looked up in
 * `process.env`. Throws if the referenced variable is not set.
 */
export function resolveCredential(key: string, value: string): string {
  if (value.startsWith('env:')) {
    const envVar = value.slice(4);
    const resolved = process.env[envVar];
    if (resolved === undefined) {
      throw new Error(
        `Environment variable '${envVar}' not found (referenced by credential '${key}')`
      );
    }
    return resolved;
  }
  return value;
}

/**
 * Resolve all credential entries in a credentials map.
 */
export function resolveCredentials(
  credentials: Record<string, string> | undefined
): Record<string, string> {
  if (!credentials) return {};
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(credentials)) {
    resolved[key] = resolveCredential(key, value);
  }
  return resolved;
}

// Re-export parsing functions so existing imports from registry still work.
export { buildManifests, parsePlexusToml };

/**
 * The Plexus registry watches `plexus.toml` and keeps the lifecycle manager
 * in sync with the declared adapters.
 */
export class PlexusRegistry {
  private tomlPath: string;
  private watcher: ReturnType<typeof watch> | null = null;
  private knownManifests = new Map<string, PluginManifest>();
  private adapterFactories = new Map<string, () => PlexusAdapterInterface>();
  private reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private lifecycle: PlexusLifecycleManager,
    options?: { configDir?: string }
  ) {
    const configDir = options?.configDir ?? join(getEngramRoot(), '.config');
    this.tomlPath = join(configDir, 'plexus.toml');
  }

  /** Register a built-in adapter factory (PRD-091 provides implementations). */
  registerFactory(builtinName: string, factory: () => PlexusAdapterInterface): void {
    this.adapterFactories.set(`builtin:${builtinName}`, factory);
  }

  /** Load `plexus.toml` and register all enabled adapters. */
  async loadAndReconcile(): Promise<void> {
    const manifests = this.readManifests();
    await this.reconcile(manifests);
  }

  /** Start watching `plexus.toml` for changes. */
  startWatching(): void {
    if (this.watcher || !existsSync(this.tomlPath)) return;

    this.watcher = watch(this.tomlPath, () => {
      if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
      this.reconcileTimer = setTimeout(() => {
        void this.loadAndReconcile().catch((err: unknown) => {
          console.error(
            '[plexus] Failed to reconcile after plexus.toml change:',
            err instanceof Error ? err.message : err
          );
        });
      }, 2_000);
    });
  }

  /** Stop watching and clean up timers. */
  stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.reconcileTimer) clearTimeout(this.reconcileTimer);
    this.reconcileTimer = null;
  }

  /** Get the current TOML path (for testing / diagnostics). */
  getTomlPath(): string {
    return this.tomlPath;
  }

  // -----------------------------------------------------------------------
  // Private
  // -----------------------------------------------------------------------

  private readManifests(): PluginManifest[] {
    if (!existsSync(this.tomlPath)) return [];
    try {
      const content = readFileSync(this.tomlPath, 'utf-8');
      return buildManifests(parsePlexusToml(content));
    } catch (err) {
      console.error(
        '[plexus] Failed to parse plexus.toml:',
        err instanceof Error ? err.message : err
      );
      return [];
    }
  }

  private async reconcile(manifests: PluginManifest[]): Promise<void> {
    const desiredNames = new Set(manifests.filter((m) => m.enabled).map((m) => m.name));

    // Remove adapters no longer in config.
    for (const name of this.knownManifests.keys()) {
      if (!desiredNames.has(name)) {
        await this.lifecycle.unregister(`plx_${name}`);
        this.knownManifests.delete(name);
      }
    }

    // Register new or modified adapters.
    for (const manifest of manifests) {
      if (!manifest.enabled) continue;
      await this.reconcileAdapter(manifest);
    }
  }

  private async reconcileAdapter(manifest: PluginManifest): Promise<void> {
    const existing = this.knownManifests.get(manifest.name);
    if (existing && JSON.stringify(existing) === JSON.stringify(manifest)) return;

    const adapter = this.resolveAdapter(manifest);
    if (!adapter) {
      console.error(
        `[plexus] Could not resolve module '${manifest.module}' for '${manifest.name}'`
      );
      return;
    }

    let credentials: Record<string, string>;
    try {
      credentials = resolveCredentials(manifest.credentials);
    } catch (err) {
      console.error(
        `[plexus] Credential resolution failed for '${manifest.name}':`,
        err instanceof Error ? err.message : err
      );
      return;
    }

    await this.lifecycle.register(
      adapter,
      { name: manifest.name, credentials, settings: manifest.settings },
      manifest.filters
    );
    this.knownManifests.set(manifest.name, manifest);
  }

  private resolveAdapter(manifest: PluginManifest): PlexusAdapterInterface | null {
    const factory = this.adapterFactories.get(manifest.module);
    return factory ? factory() : null;
  }
}
