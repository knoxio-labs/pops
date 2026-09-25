/**
 * The trigger's pointer-type split: a mouse opens on press (Radix's own
 * behaviour), a touch opens only once the tap completes, so a swipe that
 * starts on a trigger scrolls the page instead of opening a modal menu.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './dropdown-menu';

function Menu(props: React.ComponentProps<typeof DropdownMenu>) {
  return (
    <DropdownMenu {...props}>
      <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>Edit</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const trigger = () => screen.getByRole('button', { name: 'Actions' });

describe('DropdownMenuTrigger', () => {
  it('opens on a mouse press, as Radix does', () => {
    render(<Menu />);
    fireEvent.pointerDown(trigger(), { pointerType: 'mouse', button: 0 });
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('does not open when a touch only presses the trigger, as a scroll does', () => {
    render(<Menu />);
    fireEvent.pointerDown(trigger(), { pointerType: 'touch', button: 0 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });

  it('opens when a touch completes a tap', () => {
    render(<Menu />);
    fireEvent.pointerDown(trigger(), { pointerType: 'touch', button: 0 });
    fireEvent.click(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('treats a pen like a touch', () => {
    render(<Menu />);
    fireEvent.pointerDown(trigger(), { pointerType: 'pen', button: 0 });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger());
    expect(screen.getByRole('menu')).toBeInTheDocument();
  });

  it('closes from a tap when the tap began on an open menu', () => {
    const onOpenChange = vi.fn();
    render(<Menu open onOpenChange={onOpenChange} modal={false} />);
    fireEvent.pointerDown(trigger(), { pointerType: 'touch', button: 0 });
    fireEvent.click(trigger());
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('reports a tap-open through onOpenChange when controlled', () => {
    const onOpenChange = vi.fn();
    render(<Menu open={false} onOpenChange={onOpenChange} />);
    fireEvent.pointerDown(trigger(), { pointerType: 'touch', button: 0 });
    fireEvent.click(trigger());
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('ignores a keyboard click, which Radix already handles on keydown', () => {
    const onOpenChange = vi.fn();
    render(<Menu onOpenChange={onOpenChange} />);
    fireEvent.click(trigger());
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
