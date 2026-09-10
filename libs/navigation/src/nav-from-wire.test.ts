/**
 * The projection that lets a pillar declare its nav once (POPS-3359).
 *
 * The runtime half is easy to check. The type half is the one that matters
 * and the one a normal assertion cannot reach: the app's
 * `satisfies AppNavConfigShape` checks every icon against `IconName`, and
 * that check is why two literals looked justified. `expectTypeOf` is what
 * asserts the projection preserves it — a `pascalCase` returning plain
 * `string` would pass every runtime case below and quietly cost the app its
 * icon safety.
 */
import { describe, expect, expectTypeOf, it } from 'vitest';

import { iconMap } from './icon-map';
import { navConfigFromWire, pascalCase, type PascalCase } from './nav-from-wire';

import type { IconName } from './types';

describe('pascalCase', () => {
  it('joins a kebab name, including one ending in a digit', () => {
    expect(pascalCase('bot')).toBe('Bot');
    expect(pascalCase('dollar-sign')).toBe('DollarSign');
    expect(pascalCase('bar-chart-3')).toBe('BarChart3');
    expect(pascalCase('building-2')).toBe('Building2');
  });

  it('says the same thing at the type level', () => {
    expectTypeOf<PascalCase<'bar-chart-3'>>().toEqualTypeOf<'BarChart3'>();
    expectTypeOf<PascalCase<'building-2'>>().toEqualTypeOf<'Building2'>();
    expectTypeOf<PascalCase<'bot'>>().toEqualTypeOf<'Bot'>();
  });

  it('round-trips every icon the kit ships', () => {
    // The transform IS the naming convention, so the whole vocabulary is the
    // fixture. A convention this does not cover is one a pillar cannot spell
    // on the wire, which would send it straight back to a second literal.
    const kebabOf = (name: string) => name.replace(/(?<=[a-z])(?=[A-Z0-9])/gu, '-').toLowerCase();

    for (const name of Object.keys(iconMap)) {
      expect(pascalCase(kebabOf(name)), name).toBe(name);
    }
  });
});

describe('navConfigFromWire', () => {
  const wire = {
    id: 'ai',
    label: 'AI',
    labelKey: 'ai',
    icon: 'bot',
    color: 'violet',
    basePath: '/ai',
    order: 70,
    items: [{ path: '', label: 'AI Usage', labelKey: 'ai.usage', icon: 'bar-chart-3' }],
  } as const;

  it('projects every icon and drops the wire-only order', () => {
    const projected = navConfigFromWire(wire);

    expect(projected).toEqual({
      id: 'ai',
      label: 'AI',
      labelKey: 'ai',
      icon: 'Bot',
      color: 'violet',
      basePath: '/ai',
      items: [{ path: '', label: 'AI Usage', labelKey: 'ai.usage', icon: 'BarChart3' }],
    });
    expect('order' in projected).toBe(false);
  });

  it('keeps the icons as literals, which is what the app’s satisfies checks', () => {
    const projected = navConfigFromWire(wire);

    expectTypeOf(projected.icon).toEqualTypeOf<'Bot'>();
    expectTypeOf(projected.items[0]?.icon).toEqualTypeOf<'BarChart3' | undefined>();
    // The projection is only worth anything if what comes out is assignable
    // to the kit's own union. A `string` return would fail here.
    expectTypeOf(projected.icon).toMatchTypeOf<IconName>();
  });

  it('projects an icon the kit does not ship to something that is not an IconName', () => {
    const bogus = navConfigFromWire({ ...wire, icon: 'not-an-icon' } as const);

    expect(bogus.icon).toBe('NotAnIcon');
    // A typo in the contract's kebab spelling now reddens the app build,
    // which two independent literals never did.
    expectTypeOf(bogus.icon).not.toMatchTypeOf<IconName>();
  });
});
