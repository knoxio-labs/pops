import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { Sheet, SheetPanel } from './Sheet';

const CONTENT = {
  title: 'Set a field',
  description: 'Update the selected items.',
  children: <p>Field values</p>,
};

function ControlledSheet({ onChange }: { onChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(true);

  return (
    <Sheet
      {...CONTENT}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onChange?.(nextOpen);
      }}
    />
  );
}

describe('Sheet', () => {
  it('names the dialog by its title and describes it by its description', () => {
    render(<Sheet {...CONTENT} open onOpenChange={vi.fn()} />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAccessibleName('Set a field');
    expect(dialog).toHaveAccessibleDescription('Update the selected items.');
  });

  it('calls onOpenChange(false) on Escape', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<ControlledSheet onChange={onOpenChange} />);
    await user.keyboard('{Escape}');

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('calls onOpenChange(false) from the Close button', async () => {
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    render(<ControlledSheet onChange={onOpenChange} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('returns focus to the trigger after closing', async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(false);

      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Open sheet
          </button>
          <Sheet {...CONTENT} open={open} onOpenChange={setOpen} />
        </>
      );
    }

    render(<Harness />);
    const trigger = screen.getByRole('button', { name: 'Open sheet' });

    await user.click(trigger);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(trigger).toHaveFocus();
  });

  it('renders no footer row without footer', () => {
    render(<Sheet {...CONTENT} open onOpenChange={vi.fn()} />);

    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('SheetPanel is a labelled region, not a dialog', () => {
    render(<SheetPanel {...CONTENT} />);

    expect(screen.getByRole('region', { name: 'Set a field' })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('calls onClose from the SheetPanel Close button', async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();

    render(<SheetPanel {...CONTENT} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it('the sheet content carries md:p-0 and md:max-h-none so it is full height and unpadded at md', () => {
    render(<Sheet {...CONTENT} open onOpenChange={vi.fn()} />);

    const className = screen.getByRole('dialog').className;
    expect(className).toContain('md:p-0');
    expect(className).toContain('md:max-h-none');
    expect(className).toContain('overflow-hidden');
    expect(className).not.toContain('md:p-6');
    expect(className).not.toContain('md:max-h-[calc(100dvh-2rem)]');
    expect(className).not.toContain('overflow-y-auto');
  });

  it('keeps the top and bottom safe-area insets below md', () => {
    render(<Sheet {...CONTENT} open onOpenChange={vi.fn()} />);

    const className = screen.getByRole('dialog').className;
    expect(className).toContain('pt-[env(safe-area-inset-top)]');
    expect(className).toContain('pb-[env(safe-area-inset-bottom)]');
  });
});
