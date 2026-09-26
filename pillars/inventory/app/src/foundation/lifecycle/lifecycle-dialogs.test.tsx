import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DestroyDialog } from './destroy-dialog';
import { LifecycleDialog } from './lifecycle-dialog';
import { QuantityDialog } from './quantity-dialog';
import { RestoreDialog } from './restore-dialog';
import { SplitDialog } from './split-dialog';

describe('LifecycleDialog', () => {
  it('exposes the reason group and keeps a required discard reason disabled until chosen', () => {
    render(
      <LifecycleDialog
        act="discard"
        subject="Bluetooth speaker"
        open
        onOpenChange={() => undefined}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Discard Bluetooth speaker?' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Reason' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Note' })).toHaveAttribute(
      'placeholder',
      'Add a note for the history (optional)'
    );
    expect(screen.getByRole('button', { name: 'Discard Bluetooth speaker' })).toBeDisabled();

    const broken = screen.getByRole('button', { name: 'Broken' });
    expect(broken).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(broken);

    expect(broken).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Discard Bluetooth speaker' })).toBeEnabled();
  });

  it('trims an Other reason and sends it through the confirmation callback', () => {
    const onConfirm = vi.fn();
    render(
      <LifecycleDialog
        act="discard"
        subject="Bluetooth speaker"
        open
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: '  donated  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Discard Bluetooth speaker' }));

    expect(onConfirm).toHaveBeenCalledWith('donated');
  });

  it('allows an optional reason to be skipped and counts a bulk subject', () => {
    const onConfirm = vi.fn();
    render(
      <LifecycleDialog
        act="retire"
        subject={3}
        open
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Retire 3 items?' })).toBeInTheDocument();
    expect(screen.getByText(/Each item records the same reason\./u)).toBeInTheDocument();
    const confirm = screen.getByRole('button', { name: 'Retire 3 items' });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith(null);
  });
});

describe('DestroyDialog', () => {
  it('uses an alert dialog, names the irreversible consequence, and confirms the reason', () => {
    const onConfirm = vi.fn();
    render(
      <DestroyDialog
        subject="Camera"
        open
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
        contentsCount={2}
      />
    );

    expect(screen.getByRole('alertdialog', { name: 'Destroy Camera?' })).toBeInTheDocument();
    expect(screen.getByText(/This is final/u)).toBeInTheDocument();
    expect(screen.getByText(/2 things inside come out first/u)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Recycled' }));
    fireEvent.click(screen.getByRole('button', { name: 'Destroy Camera' }));

    expect(onConfirm).toHaveBeenCalledWith('Recycled');
  });

  it('uses singular copy when one contained thing comes out first', () => {
    render(
      <DestroyDialog subject="Camera" open onOpenChange={() => undefined} contentsCount={1} />
    );

    expect(screen.getByText(/1 thing inside come out first/u)).toBeInTheDocument();
  });

  it('requires text when Other is selected', () => {
    const onConfirm = vi.fn();
    render(
      <DestroyDialog subject="Camera" open onOpenChange={() => undefined} onConfirm={onConfirm} />
    );

    const confirm = screen.getByRole('button', { name: 'Destroy Camera' });
    fireEvent.click(screen.getByRole('button', { name: 'Other' }));
    expect(confirm).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Note'), { target: { value: '  No longer safe  ' } });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith('No longer safe');
  });
});

describe('RestoreDialog', () => {
  it('starts a lost item in hand and sends the chosen destination', () => {
    const onConfirm = vi.fn();
    render(
      <RestoreDialog
        itemName="Umbrella"
        lifecycle="lost"
        lastPlace="Hall cupboard"
        open
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('dialog', { name: 'Found it: Umbrella' })).toBeInTheDocument();
    const inHand = screen.getByRole('radio', { name: 'In hand' });
    expect(inHand).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: 'Somewhere else' }));
    fireEvent.click(screen.getByRole('button', { name: 'Found it' }));

    expect(onConfirm).toHaveBeenCalledWith('choose');
  });
});

describe('SplitDialog', () => {
  it('blocks splitting the whole group and sends the count with the new name', () => {
    const onConfirm = vi.fn();
    render(
      <SplitDialog
        itemName="Cables"
        quantity={3}
        placeName="Desk"
        open
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
      />
    );

    const count = screen.getByLabelText('Split off');
    fireEvent.change(count, { target: { value: '3' } });

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Split off at most 2, so at least 1 stays here.'
    );
    expect(screen.getByRole('button', { name: 'Split off 3' })).toBeDisabled();

    fireEvent.change(count, { target: { value: '2' } });
    const confirm = screen.getByRole('button', { name: 'Split off 2' });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith(2, 'Cables');
  });
});

describe('QuantityDialog', () => {
  it('requires a changed whole quantity and confirms the new value', () => {
    const onConfirm = vi.fn();
    render(
      <QuantityDialog
        itemName="Cables"
        quantity={3}
        open
        onOpenChange={() => undefined}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('button', { name: 'Set quantity' })).toBeDisabled();
    const quantity = screen.getByLabelText('Quantity');
    fireEvent.change(quantity, { target: { value: '2.5' } });
    expect(screen.getByRole('alert')).toHaveTextContent('Use a whole number.');
    expect(quantity).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(quantity, { target: { value: '5' } });
    const confirm = screen.getByRole('button', { name: 'Set to 5' });
    expect(confirm).toBeEnabled();
    fireEvent.click(confirm);

    expect(onConfirm).toHaveBeenCalledWith(5);
  });

  it('rejects changing a container quantity', () => {
    render(
      <QuantityDialog
        itemName="Storage box"
        quantity={1}
        isContainer
        open
        onOpenChange={() => undefined}
      />
    );

    const quantity = screen.getByLabelText('Quantity');
    fireEvent.change(quantity, { target: { value: '2' } });

    expect(screen.getByRole('alert')).toHaveTextContent('A container is always one thing.');
    expect(screen.getByRole('button', { name: 'Set quantity' })).toBeDisabled();
  });
});
