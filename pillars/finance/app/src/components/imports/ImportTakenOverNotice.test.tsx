import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImportTakenOverNotice } from './ImportTakenOverNotice';

describe('ImportTakenOverNotice', () => {
  it('names when the draft was taken and offers the two ways out', () => {
    const onTakeBack = vi.fn();
    const onLeave = vi.fn();
    render(
      <ImportTakenOverNotice
        takenAt="2026-09-10T09:05:00+10:00"
        onTakeBack={onTakeBack}
        onLeave={onLeave}
      />
    );
    expect(screen.getByText('This import is open somewhere else now')).toBeDefined();
    expect(screen.getByText(/Another tab took it over at .*Sept?.*9:05/)).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Take it back' }));
    expect(onTakeBack).toHaveBeenCalledOnce();
    expect(onLeave).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Leave' }));
    expect(onLeave).toHaveBeenCalledOnce();
  });
});
