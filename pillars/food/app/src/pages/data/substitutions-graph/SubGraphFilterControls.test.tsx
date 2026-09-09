/**
 * `DebouncedSearchInput` moved off a raw `<input>` onto the kit `TextInput`
 * (POPS-3271). `TextInput` is a controlled component with its own local
 * `useTextInput` state; the debounce logic here relies on `local` being the
 * single source of truth for what the input shows and on `userTyping`
 * telling a parent-driven reset apart from a keystroke. Both are easy to
 * break silently in a migration — e.g. wiring `TextInput` without `value`
 * (so it manages its own uncontrolled state and `local` stops tracking what
 * is on screen) still renders correctly but the debounce never fires.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { type ReactElement, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DebouncedSearchInput } from './SubGraphFilterControls';

function ControlledHarness({ initial = '' }: { initial?: string }): ReactElement {
  const [value, setValue] = useState(initial);
  return <DebouncedSearchInput value={value} onChange={setValue} />;
}

describe('DebouncedSearchInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire onChange on every keystroke, only after the debounce window', () => {
    const onChange = vi.fn();
    render(<DebouncedSearchInput value="" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Search ingredients…');

    fireEvent.change(input, { target: { value: 'oni' } });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(onChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('oni');
  });

  it('drives the query end to end: typing updates the controlled value after debouncing', () => {
    render(<ControlledHarness />);
    const input = screen.getByPlaceholderText<HTMLInputElement>('Search ingredients…');

    fireEvent.change(input, { target: { value: 'leek' } });
    expect(input.value).toBe('leek');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(input.value).toBe('leek');
  });

  it('does not replay a stale debounce when the parent resets the value externally', () => {
    const onChange = vi.fn();
    const { rerender } = render(<DebouncedSearchInput value="banana" onChange={onChange} />);
    const input = screen.getByPlaceholderText<HTMLInputElement>('Search ingredients…');

    fireEvent.change(input, { target: { value: 'shallot' } });
    act(() => {
      vi.advanceTimersByTime(50);
    });

    rerender(<DebouncedSearchInput value="" onChange={onChange} />);
    expect(input.value).toBe('');

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onChange).not.toHaveBeenCalled();
  });
});
