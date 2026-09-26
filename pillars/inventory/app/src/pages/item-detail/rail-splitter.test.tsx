import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RailSplitter } from './rail-splitter';

describe('RailSplitter', () => {
  it('moves by keyboard steps and resets with Enter or double-click', () => {
    const onWidth = vi.fn();
    render(<RailSplitter width={300} onWidth={onWidth} />);
    const separator = screen.getByRole('separator');

    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(onWidth).toHaveBeenLastCalledWith(284);
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(onWidth).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(separator, { key: 'Enter' });
    expect(onWidth).toHaveBeenLastCalledWith(288);
    fireEvent.doubleClick(separator);
    expect(onWidth).toHaveBeenLastCalledWith(288);
  });
});
