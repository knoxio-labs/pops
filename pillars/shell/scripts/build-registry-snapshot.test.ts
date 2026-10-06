import { describe, expect, it } from 'vitest';

import { KNOWN_MODULES, MODULES } from '@pops/module-registry';

import { selectRegistrySnapshot } from './build-registry-snapshot.js';

describe('selectRegistrySnapshot', () => {
  it('keeps all known ids while filtering module rows to the install set', () => {
    const installedModule = MODULES[0];
    if (installedModule === undefined) throw new Error('expected a generated module fixture');
    const excludedId = KNOWN_MODULES.find((id) => id !== installedModule.id);
    if (excludedId === undefined)
      throw new Error('expected a known but uninstalled module fixture');

    const snapshot = selectRegistrySnapshot(KNOWN_MODULES, MODULES, [installedModule.id]);

    expect(snapshot.knownIds).toEqual(
      [...KNOWN_MODULES].toSorted((a, b) => a.localeCompare(b, 'en'))
    );
    expect(snapshot.installedIds).toEqual([installedModule.id]);
    expect(snapshot.modules).toEqual([installedModule]);
    expect(snapshot.knownIds).toContain(excludedId);
  });
});
