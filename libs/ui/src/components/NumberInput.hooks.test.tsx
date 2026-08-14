import { act, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { NumberInput } from './NumberInput';

/**
 * Counts the document-level listeners the drag effect installs, so a test can
 * assert the gesture attaches them once rather than on every committed step.
 */
function trackDocumentListeners() {
  const counts = { mousemove: 0, mouseup: 0 };
  const add = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'mousemove') counts.mousemove += 1;
    if (type === 'mouseup') counts.mouseup += 1;
    add(type, listener, options);
  });
  return counts;
}

function pressAndDrag(container: HTMLElement, from: number, to: number) {
  act(() => {
    container.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: from }));
  });
  act(() => {
    document.dispatchEvent(new MouseEvent('mousemove', { clientY: to }));
  });
}

function dragBox(): HTMLElement {
  const input = screen.getByRole('spinbutton');
  const box = input.closest('div');
  if (!box) throw new Error('NumberInput container not found');
  return box;
}

/** Controlled usage: the parent owns the value and re-renders on every commit. */
function ControlledHarness({
  initial,
  max,
  onCommit,
}: {
  initial: number;
  max?: number;
  onCommit?: (v: number) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <NumberInput
      value={value}
      max={max}
      step={1}
      onChange={(e) => {
        const next = Number(e.target.value);
        setValue(next);
        onCommit?.(next);
      }}
    />
  );
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('NumberInput drag listeners', () => {
  it('installs the document listeners once per gesture, not once per committed step', () => {
    const counts = trackDocumentListeners();
    const { container } = render(<ControlledHarness initial={0} />);

    const box = dragBox();
    act(() => {
      box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    });
    for (const clientY of [90, 80, 70, 60]) {
      act(() => {
        document.dispatchEvent(new MouseEvent('mousemove', { clientY }));
      });
    }

    expect(counts.mousemove).toBe(1);
    expect(counts.mouseup).toBe(1);
    expect(container).toBeTruthy();
  });

  it('removes the document listeners when the gesture ends', () => {
    const remove = vi.spyOn(document, 'removeEventListener');
    render(<ControlledHarness initial={0} />);

    const box = dragBox();
    act(() => {
      box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mouseup', {}));
    });

    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toContain('mousemove');
    expect(removed).toContain('mouseup');

    const before = screen.getByRole('spinbutton') as HTMLInputElement;
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 0 }));
    });
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe(before.value);
  });

  it('commits through the latest onChange, so the parent value keeps accumulating', () => {
    const onCommit = vi.fn();
    render(<ControlledHarness initial={0} onCommit={onCommit} />);

    const box = dragBox();
    act(() => {
      box.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientY: 100 }));
    });
    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 80 }));
    });

    // 20px up / 2px per step * step 1 = +10 from the value captured at mousedown.
    expect(onCommit).toHaveBeenLastCalledWith(10);
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('10');
  });

  it('clamps against the max from the current render, not the one captured at drag start', () => {
    function ShrinkingMaxHarness() {
      const [value, setValue] = useState(0);
      // The ceiling drops to 5 as soon as the first drag step commits, so a
      // stale closure over `commitValue` would let the value run past it.
      const max = value === 0 ? 100 : 5;
      return (
        <NumberInput
          value={value}
          max={max}
          step={1}
          onChange={(e) => setValue(Number(e.target.value))}
        />
      );
    }
    render(<ShrinkingMaxHarness />);

    const box = dragBox();
    pressAndDrag(box, 100, 96);
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('2');

    act(() => {
      document.dispatchEvent(new MouseEvent('mousemove', { clientY: 60 }));
    });
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('5');
  });
});
