import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FixtureFormDialog } from './fixture-form-dialog.js';

import type { ComponentProps } from 'react';

type DialogProps = ComponentProps<typeof FixtureFormDialog>;

const fixture = {
  createdAt: '2026-09-01T00:00:00.000Z',
  id: 'fixture-1',
  lastEditedTime: '2026-09-02T00:00:00.000Z',
  locationId: 'room-1',
  name: 'Desk outlet',
  notes: 'Old note',
  type: 'power',
};

function renderDialog(overrides: Partial<DialogProps> = {}) {
  const onOpenChange = vi.fn();
  const onSave = vi.fn().mockResolvedValue(fixture);
  render(
    <FixtureFormDialog
      open
      onOpenChange={onOpenChange}
      locations={[{ id: 'room-1', name: 'Office', parentId: null, kind: 'room' }]}
      fixture={fixture}
      onSave={onSave}
      {...overrides}
    />
  );
  return { onOpenChange, onSave };
}

describe('FixtureFormDialog', () => {
  it('trims names and blank notes before saving, then closes after success', async () => {
    const { onOpenChange, onSave } = renderDialog();
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: '  Hall outlet  ' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Note' }), {
      target: { value: '   ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith({
        name: 'Hall outlet',
        kind: 'power',
        locationId: 'room-1',
        notes: null,
      })
    );
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps an unknown server kind unselected and blocks saving until chosen', () => {
    renderDialog({ fixture: { ...fixture, type: 'legacy' } });

    expect(screen.getByRole('combobox', { name: 'Kind' })).toHaveValue('');
    expect(screen.getByText('Choose its kind.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('keeps the draft open after a rejected save', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('write failed'));
    const { onOpenChange } = renderDialog({ onSave });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), {
      target: { value: '  Retained draft  ' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledOnce());
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('  Retained draft  ');
  });

  it('shows a retryable room error instead of an empty room picker', () => {
    const onRetryLocations = vi.fn();
    renderDialog({ locationsStatus: 'error', onRetryLocations });

    expect(screen.getByText('Rooms did not load')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryLocations).toHaveBeenCalledOnce();
  });
});
