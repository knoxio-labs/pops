/**
 * Tests for the shell-side module→pillar mapping (ADR-026 P3).
 */
import { describe, expect, it } from 'vitest';

import { pillarIdForModule, REGISTRY_PILLAR_ID } from './manifest-pillar';

describe('pillarIdForModule', () => {
  it('routes modules with an in-repo 1:1 pillar to their own pillar id', () => {
    const dedicatedPillarModules = [
      'ai',
      'cerebrum',
      'finance',
      'food',
      'inventory',
      'lists',
      'media',
    ];
    for (const id of dedicatedPillarModules) {
      expect(pillarIdForModule(id)).toBe(id);
    }
  });

  it('falls back to the platform registry pillar for modules with no dedicated pillar', () => {
    // `ego` is a shell-hosted overlay with no backend pillar of its own.
    expect(pillarIdForModule('ego')).toBe(REGISTRY_PILLAR_ID);
  });

  it('returns the platform registry pillar for unknown module ids (fallback)', () => {
    expect(pillarIdForModule('some-future-module')).toBe('registry');
  });

  it('exports REGISTRY_PILLAR_ID as the literal "registry"', () => {
    expect(REGISTRY_PILLAR_ID).toBe('registry');
  });
});
