import { describe, expect, it } from 'vitest';

import { rankTopBarWidgets } from './top-bar-widget-registry';

import type { BundleEntry, TopBarWidgetBundle } from '../../bundle-entry';

const Widget = () => null;

function entry(pillarId: string, widgets?: readonly Omit<TopBarWidgetBundle, 'Component'>[]) {
  const value: BundleEntry = {
    manifest: { id: pillarId, name: pillarId, surfaces: ['app'] },
    navOrder: 0,
    ...(widgets !== undefined
      ? { topBarWidgets: widgets.map((w) => ({ ...w, Component: Widget })) }
      : {}),
  };
  return value;
}

const keysOf = (bundleMap: Readonly<Record<string, BundleEntry>>) =>
  rankTopBarWidgets(bundleMap).map((w) => `${w.pillarId}:${w.bundleSlot}`);

describe('rankTopBarWidgets', () => {
  it('returns nothing for an empty map', () => {
    expect(rankTopBarWidgets({})).toEqual([]);
  });

  it('returns nothing when no entry contributes a widget', () => {
    expect(rankTopBarWidgets({ acme: entry('acme'), beta: entry('beta', []) })).toEqual([]);
  });

  it('sorts ascending by order across pillars', () => {
    const map = {
      acme: entry('acme', [{ bundleSlot: 'late', order: 30 }]),
      beta: entry('beta', [{ bundleSlot: 'early', order: -5 }]),
      gamma: entry('gamma', [{ bundleSlot: 'middle', order: 10 }]),
    };
    expect(keysOf(map)).toEqual(['beta:early', 'gamma:middle', 'acme:late']);
  });

  it('breaks an order tie by pillar id, then by slot', () => {
    const map = {
      zeta: entry('zeta', [{ bundleSlot: 'a', order: 10 }]),
      acme: entry('acme', [
        { bundleSlot: 'second', order: 10 },
        { bundleSlot: 'first', order: 10 },
      ]),
    };
    expect(keysOf(map)).toEqual(['acme:first', 'acme:second', 'zeta:a']);
  });

  it('attributes each widget to the pillar whose entry carries it', () => {
    const [ranked] = rankTopBarWidgets({ acme: entry('acme', [{ bundleSlot: 'x', order: 1 }]) });
    expect(ranked).toEqual({ pillarId: 'acme', bundleSlot: 'x', order: 1, Component: Widget });
  });
});
