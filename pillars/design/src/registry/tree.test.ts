import { describe, expect, it } from 'vitest';

import { buildScreenTree } from './tree';

import type { GroupNode, Placed, TreeNode } from './tree';

const item = (id: string, order = 0): Placed => ({ id, order });

/** The shape of a level, as `name/` for a group and `id` for a screen. */
function outline(nodes: TreeNode<Placed>[]): string[] {
  return nodes.map((node) =>
    node.kind === 'group' ? `${node.group.name}/` : (node.item.id.split('/').at(-1) ?? '')
  );
}

function areaNamed(areas: GroupNode<Placed>[], name: string): GroupNode<Placed> {
  const found = areas.find((a) => a.name === name);
  if (!found) throw new Error(`no area ${name}`);
  return found;
}

describe('buildScreenTree', () => {
  it('groups by area and keeps a flat area flat', () => {
    const areas = buildScreenTree([item('finance/a'), item('finance/b'), item('media/c')]);
    expect(areas.map((a) => a.name)).toEqual(['finance', 'media']);
    expect(outline(areaNamed(areas, 'finance').children)).toEqual(['a', 'b']);
  });

  it('nests to any depth the ids describe', () => {
    const areas = buildScreenTree([item('finance/accounts/pickers/entity')]);
    const accounts = areaNamed(areas, 'finance').children[0];
    expect(accounts?.kind).toBe('group');
    if (accounts?.kind !== 'group') return;
    expect(accounts.group.path).toEqual(['finance', 'accounts']);
    const pickers = accounts.group.children[0];
    if (pickers?.kind !== 'group') throw new Error('expected a nested group');
    expect(pickers.group.path).toEqual(['finance', 'accounts', 'pickers']);
    expect(outline(pickers.group.children)).toEqual(['entity']);
  });

  it('interleaves a group with its sibling screens by order', () => {
    const areas = buildScreenTree([
      item('finance/warnings', 3),
      item('finance/accounts/form', 2),
      item('finance/review', 1),
    ]);
    expect(outline(areaNamed(areas, 'finance').children)).toEqual([
      'review',
      'accounts/',
      'warnings',
    ]);
  });

  it('takes a group and an area from the lowest order beneath them', () => {
    const areas = buildScreenTree([item('media/library', 5), item('finance/accounts/form', 2)]);
    expect(areas.map((a) => a.name)).toEqual(['finance', 'media']);
    const group = areaNamed(areas, 'finance').children[0];
    if (group?.kind !== 'group') throw new Error('expected a group');
    expect(group.group.order).toBe(2);
  });

  it('breaks an order tie on name, so the tree is stable', () => {
    const areas = buildScreenTree([item('a/zebra'), item('a/mice/one'), item('a/alpha')]);
    expect(outline(areaNamed(areas, 'a').children)).toEqual(['alpha', 'mice/', 'zebra']);
  });

  it('drops an id with no area to sit under', () => {
    expect(buildScreenTree([item('loose')])).toEqual([]);
  });
});
