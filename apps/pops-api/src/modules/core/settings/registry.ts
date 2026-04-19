import type { SettingsManifest } from '@pops/types';

class SettingsRegistry {
  private manifests = new Map<string, SettingsManifest>();

  register(manifest: SettingsManifest): void {
    const occupiedKeys = new Map<string, string>();
    for (const [existingId, m] of this.manifests) {
      for (const group of m.groups) {
        for (const field of group.fields) {
          occupiedKeys.set(field.key, existingId);
        }
      }
    }
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        const claimant = occupiedKeys.get(field.key);
        if (claimant) {
          throw new Error(
            `Settings key "${field.key}" already registered by "${claimant}" — cannot register again in "${manifest.id}"`
          );
        }
      }
    }
    this.manifests.set(manifest.id, manifest);
  }

  getAll(): SettingsManifest[] {
    return [...this.manifests.values()].toSorted((a, b) => a.order - b.order);
  }
}

export const settingsRegistry = new SettingsRegistry();
