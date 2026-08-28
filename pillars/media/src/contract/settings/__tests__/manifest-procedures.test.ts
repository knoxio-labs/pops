/**
 * Guards the settings-manifest → REST-contract link.
 *
 * `SettingsField.testAction.procedure` and `optionsLoader.procedure` are plain
 * strings the shell resolves at runtime (`useDynamicOptionsLoaders` →
 * `pillar(id).callDynamic(router, proc)`), so renaming a contract route cannot
 * break them at compile time — it breaks them silently in the browser, as a
 * dropdown that renders empty. The Lake migration renamed
 * `arr.getQualityProfiles` / `arr.getRootFolders` to their `getRadarr*` forms
 * and left both manifest strings pointing at the old names; nothing failed
 * until the fields were opened in production.
 *
 * Manifests come from the `./settings` barrel rather than a hand-written list
 * so a manifest that is added, or moved to its own module, stays covered.
 */
import { describe, expect, it } from 'vitest';

import { mediaContract } from '../../rest.js';
import * as mediaSettings from '../index.js';

import type { SettingsManifest } from '@pops/types';

interface ProcedureRef {
  manifestId: string;
  fieldKey: string;
  source: 'testAction' | 'optionsLoader';
  procedure: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSettingsManifest(value: unknown): value is SettingsManifest {
  return isRecord(value) && typeof value['id'] === 'string' && Array.isArray(value['groups']);
}

const MANIFESTS: SettingsManifest[] = Object.values(mediaSettings).filter(isSettingsManifest);

function collectProcedureRefs(manifests: readonly SettingsManifest[]): ProcedureRef[] {
  const refs: ProcedureRef[] = [];
  for (const manifest of manifests) {
    for (const group of manifest.groups) {
      for (const field of group.fields) {
        const { testAction, optionsLoader } = field;
        if (testAction) {
          refs.push({
            manifestId: manifest.id,
            fieldKey: field.key,
            source: 'testAction',
            procedure: testAction.procedure,
          });
        }
        if (optionsLoader) {
          refs.push({
            manifestId: manifest.id,
            fieldKey: field.key,
            source: 'optionsLoader',
            procedure: optionsLoader.procedure,
          });
        }
      }
    }
  }
  return refs;
}

/**
 * Walk `mediaContract[routerName][procName]` by runtime key. The contract is a
 * ts-rest router whose keys are only known statically, so the lookup goes
 * through `unknown` and narrows on the `{ method, path }` shape every route
 * has, rather than asserting a type onto it.
 */
function resolveRoute(
  routerName: string,
  procName: string
): { method: string; path: string } | null {
  const contract: unknown = mediaContract;
  if (!isRecord(contract)) return null;
  const subRouter = contract[routerName];
  if (!isRecord(subRouter)) return null;
  const route = subRouter[procName];
  if (!isRecord(route)) return null;
  const { method, path } = route;
  if (typeof method !== 'string' || typeof path !== 'string') return null;
  return { method, path };
}

describe('settings manifest procedure references', () => {
  const refs = collectProcedureRefs(MANIFESTS);

  it('sees every manifest the settings barrel exports', () => {
    expect(Object.values(mediaSettings)).toHaveLength(MANIFESTS.length);
    expect(MANIFESTS.map((m) => m.id).toSorted()).toEqual([
      'media.arr',
      'media.operational',
      'media.plex',
      'media.rotation',
    ]);
  });

  it('finds the procedure references it is meant to check', () => {
    expect(refs.map((r) => r.procedure)).toContain('media.arr.getRadarrQualityProfiles');
    expect(refs.map((r) => r.procedure)).toContain('media.arr.getRadarrRootFolders');
  });

  it.each(refs)(
    '$manifestId / $fieldKey ($source) → $procedure resolves to a contract route',
    ({ procedure }) => {
      const parts = procedure.split('.');
      expect(parts).toHaveLength(3);

      const [pillarId, routerName, procName] = parts as [string, string, string];
      expect(pillarId).toBe('media');

      expect(resolveRoute(routerName, procName)).not.toBeNull();
    }
  );

  it('does not resolve a procedure the contract has never had', () => {
    expect(resolveRoute('arr', 'getQualityProfiles')).toBeNull();
    expect(resolveRoute('arr', 'getRootFolders')).toBeNull();
    expect(resolveRoute('nope', 'alsoNope')).toBeNull();
  });
});
