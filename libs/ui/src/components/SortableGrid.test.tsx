import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SortableGrid } from './SortableGrid';

function transfer() {
  return { setData: vi.fn(), setDragImage: vi.fn(), effectAllowed: '', dropEffect: '' };
}

function setup(items = ['A', 'B', 'C'], disabled = false) {
  const onReorder = vi.fn();
  const onPreviewOrderChange = vi.fn();
  const props = {
    items,
    disabled,
    getKey: (item: string) => item,
    onReorder,
    onPreviewOrderChange,
    renderItem: (item: string) => (
      <article>
        <span>{item}</span>
        <span data-testid={`handle-${item}`}>Handle</span>
      </article>
    ),
  };
  const view = render(<SortableGrid {...props} />);
  function card(key: string) {
    const element = view.container.querySelector(`[data-sortable-key="${key}"]`);
    if (!(element instanceof HTMLElement)) throw new Error(`Missing card ${key}`);
    return element;
  }
  return { ...view, props, onReorder, onPreviewOrderChange, card };
}

describe('SortableGrid', () => {
  it('captures the whole visible card when dragging starts from a nested handle', async () => {
    const { card, unmount } = setup();
    const dataTransfer = transfer();
    const original = card('A');
    vi.spyOn(original, 'getBoundingClientRect').mockReturnValue(new DOMRect(10, 20, 300, 100));
    fireEvent.dragStart(screen.getByTestId('handle-A'), { dataTransfer, clientX: 20, clientY: 40 });
    expect(dataTransfer.setDragImage).toHaveBeenCalledOnce();
    const image: unknown = dataTransfer.setDragImage.mock.calls[0]?.[0];
    expect(image).toBeInstanceOf(HTMLElement);
    if (!(image instanceof HTMLElement)) throw new Error('Missing drag image');
    expect(image).not.toBe(original);
    expect(image).toHaveTextContent('AHandle');
    expect(image.querySelector('article')).toBeVisible();
    expect(image.style.width).toBe('300px');
    expect(image.style.height).toBe('100px');
    expect(original).toHaveAttribute('data-sortable-placeholder', 'true');
    expect(original).toHaveClass('border-dashed');
    expect(original.firstElementChild).toHaveClass('invisible');
    await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
    expect(image.isConnected).toBe(false);
    unmount();
  });

  it('moves neighbours through CSS order before committing exactly once at drop', () => {
    const { card, onReorder } = setup();
    const dataTransfer = transfer();
    const original = card('A');
    fireEvent.dragStart(original, { dataTransfer });
    fireEvent.dragOver(card('C'), { dataTransfer });
    expect(card('A')).toBe(original);
    expect(card('A')).toHaveStyle({ order: 2 });
    expect(card('B')).toHaveStyle({ order: 0 });
    expect(card('C')).toHaveStyle({ order: 1 });
    expect(onReorder).not.toHaveBeenCalled();
    fireEvent.drop(card('C'), { dataTransfer });
    fireEvent.drop(card('C'), { dataTransfer });
    fireEvent.dragEnd(original, { dataTransfer });
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(['B', 'C', 'A']);
    expect(original).not.toHaveAttribute('data-sortable-placeholder');
  });

  it('keeps the last preview stable over repeated events and its moving placeholder', () => {
    const { card, onReorder } = setup();
    const dataTransfer = transfer();
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.dragOver(card('B'), { dataTransfer });
    fireEvent.dragOver(card('B'), { dataTransfer });
    fireEvent.dragOver(card('A'), { dataTransfer });
    expect(card('A')).toHaveStyle({ order: 1 });
    fireEvent.drop(card('A'), { dataTransfer });
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(['B', 'A', 'C']);
  });

  it('reports live order only when it changes and clears the preview on drop', () => {
    const { card, onReorder, onPreviewOrderChange, rerender, props } = setup();
    const dataTransfer = transfer();
    expect(onPreviewOrderChange).not.toHaveBeenCalled();
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.dragOver(card('C'), { dataTransfer });
    expect(onPreviewOrderChange).toHaveBeenCalledExactlyOnceWith(['B', 'C', 'A']);
    expect(onReorder).not.toHaveBeenCalled();
    rerender(<SortableGrid {...props} />);
    fireEvent.dragOver(card('C'), { dataTransfer });
    expect(onPreviewOrderChange).toHaveBeenCalledOnce();
    fireEvent.drop(card('C'), { dataTransfer });
    fireEvent.dragEnd(card('A'), { dataTransfer });
    expect(onPreviewOrderChange.mock.calls).toEqual([[['B', 'C', 'A']], [null]]);
  });

  it('clears a reported preview after cancelling', () => {
    const { card, onPreviewOrderChange } = setup();
    const dataTransfer = transfer();
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.dragOver(card('C'), { dataTransfer });
    fireEvent.dragEnd(card('A'), { dataTransfer });
    expect(onPreviewOrderChange).toHaveBeenLastCalledWith(null);
  });

  it('restores order and shows the card on cancellation', () => {
    const { card, onReorder } = setup();
    const dataTransfer = transfer();
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.dragOver(card('C'), { dataTransfer });
    fireEvent.dragEnd(card('A'), { dataTransfer });
    expect(card('A')).toHaveStyle({ order: 0 });
    expect(card('B')).toHaveStyle({ order: 1 });
    expect(card('A').firstElementChild).not.toHaveClass('invisible');
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('does not emit an unchanged drop, including a move back to the original order', () => {
    const { card, onReorder } = setup();
    const dataTransfer = transfer();
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.drop(card('A'), { dataTransfer });
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.dragOver(card('B'), { dataTransfer });
    fireEvent.dragOver(card('B'), { dataTransfer });
    fireEvent.dragOver(card('A'), { dataTransfer });
    fireEvent.dragOver(card('B'), { dataTransfer });
    fireEvent.drop(card('B'), { dataTransfer });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('supports dropping on a target without an earlier dragover', () => {
    const { card, onReorder } = setup();
    const dataTransfer = transfer();
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.drop(card('C'), { dataTransfer });
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(['B', 'C', 'A']);
  });

  it('ignores disabled sorting', () => {
    const { card, onReorder } = setup(['A', 'B', 'C'], true);
    const dataTransfer = transfer();
    expect(card('A')).toHaveAttribute('draggable', 'false');
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.dragOver(card('B'), { dataTransfer });
    fireEvent.drop(card('B'), { dataTransfer });
    expect(dataTransfer.setDragImage).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('ignores dragovers and drops from outside the grid', () => {
    const { card, onReorder } = setup();
    const dataTransfer = transfer();
    fireEvent.dragOver(card('B'), { dataTransfer });
    fireEvent.drop(card('B'), { dataTransfer });
    expect(card('A')).toHaveStyle({ order: 0 });
    expect(onReorder).not.toHaveBeenCalled();
  });

  it.each([
    { items: ['A', 'B', 'C'], disabled: true },
    { items: ['A', 'B', 'C', 'D'], disabled: false },
    { items: ['B', 'C'], disabled: false },
    { items: ['C', 'B', 'A'], disabled: false },
  ])('cancels an active drag when incoming props change: %j', (next) => {
    const { card, onReorder, onPreviewOrderChange, props, rerender } = setup();
    const dataTransfer = transfer();
    fireEvent.dragStart(card('A'), { dataTransfer });
    fireEvent.dragOver(card('C'), { dataTransfer });
    rerender(<SortableGrid {...props} {...next} />);
    expect(onPreviewOrderChange).toHaveBeenLastCalledWith(null);
    expect(card('B')).not.toHaveAttribute('data-sortable-placeholder');
    expect(card('B')).toHaveStyle({ order: next.items.indexOf('B') });
    fireEvent.drop(card('B'), { dataTransfer });
    expect(onReorder).not.toHaveBeenCalled();
    rerender(<SortableGrid {...props} />);
    expect(card('A')).not.toHaveAttribute('data-sortable-placeholder');
  });

  it('uses current item values when their stable keys have not changed', () => {
    const onReorder = vi.fn();
    const initial = [
      { id: 'A', value: 1 },
      { id: 'B', value: 2 },
    ];
    const props = {
      getKey: (item: { id: string; value: number }) => item.id,
      renderItem: (item: { id: string; value: number }) => <span>{item.id}</span>,
      onReorder,
    };
    const { container, rerender } = render(<SortableGrid {...props} items={initial} />);
    const source = container.querySelector('[data-sortable-key="A"]');
    const target = container.querySelector('[data-sortable-key="B"]');
    if (!source || !target) throw new Error('Missing cards');
    const dataTransfer = transfer();
    fireEvent.dragStart(source, { dataTransfer });
    const updated = [
      { id: 'A', value: 10 },
      { id: 'B', value: 20 },
    ];
    rerender(<SortableGrid {...props} items={updated} />);
    fireEvent.drop(target, { dataTransfer });
    expect(onReorder).toHaveBeenCalledExactlyOnceWith([updated[1], updated[0]]);
  });

  it('does not sort the parent when a nested draggable handles its own drag', () => {
    const onReorder = vi.fn();
    const { container } = render(
      <SortableGrid
        items={['A', 'B']}
        getKey={(item) => item}
        onReorder={onReorder}
        renderItem={(item) => (
          <span draggable onDragStart={(event) => event.stopPropagation()}>
            {item}
          </span>
        )}
      />
    );
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByText('A'), { dataTransfer });
    fireEvent.dragOver(screen.getByText('B'), { dataTransfer });
    fireEvent.drop(screen.getByText('B'), { dataTransfer });
    expect(container.querySelector('[data-sortable-placeholder]')).toBeNull();
    expect(dataTransfer.setDragImage).not.toHaveBeenCalled();
    expect(onReorder).not.toHaveBeenCalled();
  });

  it('isolates nested SortableGrid events from the parent grid', () => {
    const outer = vi.fn();
    const inner = vi.fn();
    render(
      <SortableGrid
        items={['outer']}
        getKey={(item) => item}
        onReorder={outer}
        renderItem={() => (
          <SortableGrid
            items={['inner-A', 'inner-B']}
            getKey={(item) => item}
            onReorder={inner}
            renderItem={(item) => <span>{item}</span>}
          />
        )}
      />
    );
    const dataTransfer = transfer();
    fireEvent.dragStart(screen.getByText('inner-A'), { dataTransfer });
    const target = screen.getAllByText('inner-B')[0];
    if (!target) throw new Error('Missing nested target');
    fireEvent.drop(target, { dataTransfer });
    expect(inner).toHaveBeenCalledExactlyOnceWith(['inner-B', 'inner-A']);
    expect(outer).not.toHaveBeenCalled();
    expect(dataTransfer.setDragImage).toHaveBeenCalledOnce();
  });

  it('rejects duplicate React key representations', () => {
    expect(() =>
      render(
        <SortableGrid
          items={[1, '1']}
          getKey={(item) => item}
          renderItem={String}
          onReorder={vi.fn()}
        />
      )
    ).toThrow('SortableGrid requires unique item keys.');
  });
});
