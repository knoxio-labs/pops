import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { type TreeNode, TreeView } from './TreeView';

interface Item {
  label: string;
}

function node(id: string, label: string, children: TreeNode<Item>[] = []): TreeNode<Item> {
  return { id, data: { label }, children };
}

const NODES: TreeNode<Item>[] = [
  node('a', 'Alpha', [node('a1', 'Alpha-1'), node('a2', 'Alpha-2')]),
  node('b', 'Bravo', [node('b1', 'Bravo-1')]),
  node('c', 'Charlie'),
];

function renderTree(props: Partial<Parameters<typeof TreeView<Item>>[0]> = {}) {
  return render(
    <TreeView
      nodes={NODES}
      renderNode={(n) => n.data.label}
      defaultExpandedIds={['a']}
      {...props}
    />
  );
}

function rowByLabel(label: string) {
  return screen.getByText(label).closest('[role="treeitem"]') as HTMLElement;
}

function focusRow(label: string) {
  act(() => {
    rowByLabel(label).focus();
  });
}

describe('TreeView — roving keyboard navigation', () => {
  it('presents a single tab stop into the tree, not one per row', () => {
    renderTree();

    const rows = screen.getAllByRole('treeitem');
    const tabbable = rows.filter((row) => row.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);

    const skipped = rows.filter((row) => row.getAttribute('tabindex') === '-1');
    expect(skipped).toHaveLength(rows.length - 1);
  });

  it('moves focus down through visible rows with ArrowDown, skipping collapsed children', async () => {
    const user = userEvent.setup();
    renderTree();

    focusRow('Alpha');
    expect(rowByLabel('Alpha')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(rowByLabel('Alpha-1')).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    expect(rowByLabel('Alpha-2')).toHaveFocus();

    // Bravo's children are collapsed by default — ArrowDown must land on
    // Bravo itself next, not on the unreachable Bravo-1.
    await user.keyboard('{ArrowDown}');
    expect(rowByLabel('Bravo')).toHaveFocus();
    expect(screen.queryByText('Bravo-1')).not.toBeInTheDocument();
  });

  it('moves focus back up through visible rows with ArrowUp', async () => {
    const user = userEvent.setup();
    renderTree();

    focusRow('Bravo');

    await user.keyboard('{ArrowUp}');
    expect(rowByLabel('Alpha-2')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(rowByLabel('Alpha-1')).toHaveFocus();

    await user.keyboard('{ArrowUp}');
    expect(rowByLabel('Alpha')).toHaveFocus();

    // Already at the top — ArrowUp is a no-op, not an error.
    await user.keyboard('{ArrowUp}');
    expect(rowByLabel('Alpha')).toHaveFocus();
  });

  it('makes a collapsed node’s children reachable again once expanded', async () => {
    const user = userEvent.setup();
    renderTree();

    focusRow('Bravo');
    expect(screen.queryByText('Bravo-1')).not.toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Bravo-1')).toBeInTheDocument();

    await user.keyboard('{ArrowDown}');
    expect(rowByLabel('Bravo-1')).toHaveFocus();
  });

  it('jumps to the first and last visible row with Home/End', async () => {
    const user = userEvent.setup();
    renderTree();

    focusRow('Alpha-1');

    await user.keyboard('{End}');
    expect(rowByLabel('Charlie')).toHaveFocus();

    await user.keyboard('{Home}');
    expect(rowByLabel('Alpha')).toHaveFocus();
  });

  it('leaves expand/collapse behaviour on ArrowRight/ArrowLeft unchanged', async () => {
    const user = userEvent.setup();
    renderTree();

    focusRow('Bravo');
    expect(screen.queryByText('Bravo-1')).not.toBeInTheDocument();

    await user.keyboard('{ArrowRight}');
    expect(screen.getByText('Bravo-1')).toBeInTheDocument();
    expect(rowByLabel('Bravo')).toHaveFocus();

    await user.keyboard('{ArrowLeft}');
    expect(screen.queryByText('Bravo-1')).not.toBeInTheDocument();
    expect(rowByLabel('Bravo')).toHaveFocus();
  });

  it('keeps the roving tab stop in sync with the row the user actually focused', async () => {
    const user = userEvent.setup();
    renderTree();

    focusRow('Charlie');
    expect(rowByLabel('Charlie')).toHaveAttribute('tabindex', '0');
    expect(rowByLabel('Alpha')).toHaveAttribute('tabindex', '-1');

    await user.keyboard('{ArrowUp}');
    expect(rowByLabel('Bravo')).toHaveAttribute('tabindex', '0');
    expect(rowByLabel('Charlie')).toHaveAttribute('tabindex', '-1');
  });

  it('falls back to the first visible row when selectedId points into a collapsed subtree', () => {
    renderTree({ selectedId: 'b1', defaultExpandedIds: ['a'] });

    // 'b1' (Bravo-1) is selected but Bravo is collapsed, so it never appears
    // in the flattened, visible row list — the roving tab stop must still
    // land on exactly one visible row rather than vanishing.
    expect(screen.queryByText('Bravo-1')).not.toBeInTheDocument();

    const rows = screen.getAllByRole('treeitem');
    const tabbable = rows.filter((row) => row.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
    expect(rowByLabel('Alpha')).toHaveAttribute('tabindex', '0');
  });

  it('still fires onSelect on Enter/Space without touching focus movement', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTree({ onSelect });

    focusRow('Alpha-1');
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1' }));
  });
});
