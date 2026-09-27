import { describe, expect, it } from 'vitest';

import { coreItem, coreWorld } from '../../foundation/test-fixtures/core';
import {
  itemRecordCommand,
  placementArgumentCommand,
  thisItemCommands,
  uniquePlacementTargets,
} from './palette-commands';

describe('inventory palette commands', () => {
  it('builds This item verbs for a placed coded item', () => {
    const commands = thisItemCommands(coreItem('itm-tv'));

    expect(commands.map((entry) => entry.label)).toEqual([
      'Move Television',
      'Pick up Television',
      'Copy code TV1',
    ]);
    expect(commands[0]?.argument).toBe('placement');
    expect(commands.map((entry) => entry.action.kind)).toEqual(['move', 'pick-up', 'copy-code']);
  });

  it('offers close for an open container and put back for an item in hand', () => {
    const containerCommands = thisItemCommands(coreItem('box-k13'));
    const inHandCommands = thisItemCommands(coreItem('itm-tape'));

    expect(containerCommands.map((entry) => entry.label)).toContain('Close Kitchen 13');
    expect(inHandCommands.map((entry) => entry.label)).toContain('Put back Tape measure');
    expect(inHandCommands.map((entry) => entry.label)).not.toContain('Pick up Tape measure');
  });

  it('deduplicates recent placement targets before the catalogue targets', () => {
    const targets = uniquePlacementTargets(
      [
        { kind: 'location', locationId: 'loc-kitchen' },
        { kind: 'container', containerId: 'box-k13' },
      ],
      [
        { kind: 'location', locationId: 'loc-kitchen' },
        { kind: 'location', locationId: 'loc-garage' },
        { kind: 'container', containerId: 'box-k13' },
      ]
    );

    expect(targets).toEqual([
      { kind: 'location', locationId: 'loc-kitchen' },
      { kind: 'container', containerId: 'box-k13' },
      { kind: 'location', locationId: 'loc-garage' },
    ]);
  });

  it('keeps the target identity on placement argument rows', () => {
    const entry = placementArgumentCommand(
      { kind: 'container', containerId: 'box-k13' },
      coreWorld
    );

    expect(entry).toMatchObject({
      id: 'to-container-box-k13',
      label: 'Kitchen 13',
      target: { kind: 'container', containerId: 'box-k13' },
    });
  });

  it('includes codes and type names in record matching fields', () => {
    const entry = itemRecordCommand(coreItem('itm-tv'), coreWorld);

    expect(entry.keywords).toEqual(expect.arrayContaining(['TV1', 'Electronics']));
    expect(entry.detail).toContain('TV1');
  });
});
