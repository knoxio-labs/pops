import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MediaCard } from './MediaCard';

describe('MediaCard', () => {
  it('is not interactive without an onClick', () => {
    render(<MediaCard alt="Poster" title="Dune" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hands a pointer click straight to onClick', () => {
    const onClick = vi.fn();
    render(<MediaCard alt="Poster" title="Dune" onClick={onClick} />);
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({ type: 'click' });
  });

  it.each(['Enter', ' '])('activates on %s with the keyboard event itself', (key) => {
    const onClick = vi.fn();
    render(<MediaCard alt="Poster" title="Dune" onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key });
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick.mock.calls[0]?.[0]).toMatchObject({ type: 'keydown', key });
  });

  it('ignores other keys', () => {
    const onClick = vi.fn();
    render(<MediaCard alt="Poster" title="Dune" onClick={onClick} />);
    fireEvent.keyDown(screen.getByRole('button'), { key: 'Tab' });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('suppresses the default Space scroll when activating', () => {
    render(<MediaCard alt="Poster" title="Dune" onClick={vi.fn()} />);
    const notPrevented = fireEvent.keyDown(screen.getByRole('button'), { key: ' ' });
    expect(notPrevented).toBe(false);
  });
});
