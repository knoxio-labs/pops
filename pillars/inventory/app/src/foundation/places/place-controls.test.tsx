import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../model/placement-model.js';

import type { ReactElement } from 'react';

import type { PlacementPickerProps } from '../model/contracts.js';
import type { LocationModel } from '../model/model.js';

const mocks = vi.hoisted(() => ({
  picker: vi.fn(),
}));

vi.mock('../placement-picker/placement-picker.js', () => ({
  PlacementPicker: (
    props: PlacementPickerProps & {
      trigger: ReactElement;
      open: boolean;
      onOpenChange: (open: boolean) => void;
    }
  ) => {
    mocks.picker(props);
    return (
      <>
        <span onClick={() => props.onOpenChange(true)}>{props.trigger}</span>
        {props.open ? (
          <button
            type="button"
            onClick={() => props.onPick({ kind: 'location', locationId: 'yard' })}
          >
            Choose yard
          </button>
        ) : null}
      </>
    );
  },
}));

import { MovePlaceButton } from './move-place-button.js';
import { NameInput } from './name-input.js';

const place = (id: string, name: string, parentId: string | null = null): LocationModel => ({
  id,
  name,
  parentId,
  kind: parentId === null ? 'property' : 'room',
});

describe('place controls', () => {
  it('saves a name on Enter, shows the returned problem, and cancels on Escape', () => {
    const onCommit = vi.fn<(name: string) => string | null>(() => 'That name is already used.');
    const onCancel = vi.fn();
    render(
      <NameInput initial="Garage" label="Rename Garage" onCommit={onCommit} onCancel={onCancel} />
    );

    const input = screen.getByRole('textbox', { name: 'Rename Garage' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('Garage');
    expect(screen.getByRole('alert')).toHaveTextContent('That name is already used.');

    fireEvent.change(input, { target: { value: 'New garage' } });
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it('opens a place picker, forwards a chosen parent, and closes it', () => {
    const onPick = vi.fn();
    const onOpenChange = vi.fn();
    const world = buildWorld([], [place('garage', 'Garage'), place('yard', 'Yard')]);
    render(
      <MovePlaceButton
        world={world}
        place={place('garage', 'Garage')}
        open
        onOpenChange={onOpenChange}
        onPick={onPick}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Choose yard' }));
    expect(onPick).toHaveBeenCalledWith('yard');
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(mocks.picker).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: { kind: 'place', locationId: 'garage' },
        initialDrillId: null,
      })
    );
  });

  it('does not open when disabled', () => {
    const onOpenChange = vi.fn();
    const world = buildWorld([], [place('garage', 'Garage')]);
    render(
      <MovePlaceButton
        world={world}
        place={place('garage', 'Garage')}
        open
        onOpenChange={onOpenChange}
        onPick={vi.fn()}
        disabledReason="No connection."
      />
    );

    expect(screen.queryByRole('button', { name: 'Choose yard' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-disabled', 'true');
    expect(mocks.picker).toHaveBeenLastCalledWith(expect.objectContaining({ open: false }));
  });
});
