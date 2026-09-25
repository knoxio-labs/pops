/**
 * The Settings app's section list, from the settings manifests each pillar's
 * contract declares (the ones the shell discovers live), with a designed
 * manifest standing in for a pillar whose section is being redesigned.
 * Registry-owned sections (Core) are absent because the playground does not
 * build against the registry pillar.
 */
import { aiManifest } from '@pops/ai/manifest';
import { cerebrumManifest, egoManifest } from '@pops/cerebrum/manifest';
import { financeManifest } from '@pops/finance/manifest';
import { inventoryManifest } from '@pops/inventory/manifest';
import { mediaManifest } from '@pops/media/manifest';
import { iconMap } from '@pops/navigation';

import type { LucideIcon } from 'lucide-react';

import type { SettingsManifestDescriptor } from '@pops/pillar-sdk/manifest-schema';

const LIVE_SECTIONS: readonly SettingsManifestDescriptor[] = [
  aiManifest,
  cerebrumManifest,
  egoManifest,
  financeManifest,
  inventoryManifest,
  mediaManifest,
].flatMap((manifest) => manifest.settings ?? []);

/** One entry in the section nav. */
export interface SettingsNavEntry {
  id: string;
  title: string;
  icon: LucideIcon | null;
}

/** A labelled run of sections: `media.plex` and `media.arr` sit under Media. */
export interface SettingsNavGroup {
  label: string;
  entries: SettingsNavEntry[];
}

function isIconName(name: string): name is keyof typeof iconMap {
  return Object.hasOwn(iconMap, name);
}

function groupKey(id: string): string {
  const dot = id.indexOf('.');
  return dot === -1 ? id : id.slice(0, dot);
}

/**
 * Every section in the shell's order (ascending `order`), grouped by id
 * prefix the way the shell's section nav groups them, with `replacing`
 * swapped in for the live section of the same id.
 */
export function settingsNav(replacing: SettingsManifestDescriptor): SettingsNavGroup[] {
  const sections = LIVE_SECTIONS.map((section) =>
    section.id === replacing.id ? replacing : section
  ).toSorted((a, b) => a.order - b.order);
  const groups = new Map<string, SettingsNavEntry[]>();
  for (const section of sections) {
    const key = groupKey(section.id);
    const icon =
      section.icon !== undefined && isIconName(section.icon) ? iconMap[section.icon] : null;
    groups.set(key, [...(groups.get(key) ?? []), { id: section.id, title: section.title, icon }]);
  }
  return [...groups.entries()].map(([key, entries]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1),
    entries,
  }));
}
