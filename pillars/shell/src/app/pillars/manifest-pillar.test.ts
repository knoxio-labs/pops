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

  it('routes external (registry-synthesized) pillars to their own pillar id', () => {
    // External pillars mount as `manifest.id === descriptor.pillarId`, so their
    // routes must be guarded off their own health, not the platform registry's.
    expect(pillarIdForModule('some-external-pillar')).toBe('some-external-pillar');
    expect(pillarIdForModule('some-future-module')).toBe('some-future-module');
  });

  it('falls back to the platform registry pillar for shell-hosted overlays', () => {
    // `ego` is a shell-hosted overlay with no backend pillar of its own.
    expect(pillarIdForModule('ego')).toBe(REGISTRY_PILLAR_ID);
  });

  it('exports REGISTRY_PILLAR_ID as the literal "registry"', () => {
    expect(REGISTRY_PILLAR_ID).toBe('registry');
  });
});
