/**
 * `ShortfallRow` renders one `ResolutionRadios` per shortfall line, so the
 * radio labels have to target their own row. Before POPS-3268 scoped the
 * kit's option ids, every row emitted the same `radio-<value>` id and every
 * label pointed at row one.
 *
 * `PartialQtyEditor`'s fields used to run `Number(e.target.value)` over a
 * cleared input, committing `Number('') === 0` as the partial quantity.
 */
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PartialQtyEditor, ResolutionRadios } from '../shortfall-row-parts.js';

import type { LineResolution, LineShortfall } from '../cook-resolution-types.js';

function makeShortfall(lineIndex: number): LineShortfall {
  return {
    lineIndex,
    ingredientName: `Ingredient ${lineIndex}`,
    variantName: '',
    needed: 100,
    available: 40,
    unit: 'g',
  };
}

function ThreeRows() {
  return (
    <div>
      {[1, 2, 3].map((lineIndex) => (
        <div key={lineIndex} data-testid={`row-${lineIndex}`}>
          <ResolutionRadios
            shortfall={makeShortfall(lineIndex)}
            currentKind={undefined}
            onSelect={() => {}}
          />
        </div>
      ))}
    </div>
  );
}

const PARTIAL: Extract<LineResolution, { kind: 'partial' }> = {
  kind: 'partial',
  batchId: 42,
  consumeQty: 40,
  externalQty: 60,
};

describe('ResolutionRadios', () => {
  it('gives every row its own option ids', () => {
    render(<ThreeRows />);

    const ids = screen.getAllByRole('radio').map((radio) => radio.id);
    expect(ids).toHaveLength(9);
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('points each row label at a radio inside that same row', () => {
    render(<ThreeRows />);

    for (const lineIndex of [1, 2, 3]) {
      const row = screen.getByTestId(`row-${lineIndex}`);
      const labels = within(row).getAllByText(/pick a batch|mark consumed externally|consume/i);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        expect(label).toBeInstanceOf(HTMLLabelElement);
        if (!(label instanceof HTMLLabelElement)) continue;
        const target = document.getElementById(label.htmlFor);
        expect(target).not.toBeNull();
        expect(row.contains(target)).toBe(true);
      }
    }
  });
});

describe('PartialQtyEditor', () => {
  // `userEvent.clear` cannot empty an `<input type="number">` under jsdom —
  // it selects nothing and leaves the value in place — so these drive the
  // change event directly rather than asserting against a no-op.
  it('commits a typed quantity', () => {
    const onChange = vi.fn();
    render(<PartialQtyEditor resolution={PARTIAL} unit="g" onChange={onChange} />);

    fireEvent.change(screen.getByTestId('partial-batch-qty'), { target: { value: '7' } });

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ consumeQty: 7 }));
  });

  it('commits nothing when the batch quantity is cleared', () => {
    const onChange = vi.fn();
    render(<PartialQtyEditor resolution={PARTIAL} unit="g" onChange={onChange} />);

    fireEvent.change(screen.getByTestId('partial-batch-qty'), { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });

  it('commits nothing when the external quantity is cleared', () => {
    const onChange = vi.fn();
    render(<PartialQtyEditor resolution={PARTIAL} unit="g" onChange={onChange} />);

    fireEvent.change(screen.getByTestId('partial-external-qty'), { target: { value: '' } });

    expect(onChange).not.toHaveBeenCalled();
  });
});
