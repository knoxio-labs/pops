import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FocusedEditor } from './layouts';

afterEach(cleanup);

describe('FocusedEditor publish state', () => {
  it('does not offer direct publishing when a destructive change is refused', () => {
    render(<FocusedEditor mode="destructive" />);

    expect(screen.getByText('Cardinality cannot change in place')).toBeInTheDocument();
    expect(screen.queryByText(/no migration required/u)).toBeNull();
    expect(screen.queryByText('Review migration')).toBeNull();
  });

  it('offers direct publishing for a compatible edit', () => {
    render(<FocusedEditor mode="edit" />);

    expect(screen.getByText(/no migration required/u)).toBeInTheDocument();
  });

  it('shows a dry-run placeholder before a preview and full results once previewed', () => {
    render(<FocusedEditor mode="edit" />);
    expect(screen.getByText('Not yet previewed')).toBeInTheDocument();
    cleanup();

    render(<FocusedEditor mode="preview" />);
    expect(screen.getByText('Compatible')).toBeInTheDocument();
    expect(screen.getByText('Needs migration')).toBeInTheDocument();
  });
});

describe('FocusedEditor default field', () => {
  it('selects Manufacturer rather than the enum field shown by its own named state', () => {
    render(<FocusedEditor mode="edit" />);
    expect(screen.getByLabelText('Field label')).toHaveValue('Manufacturer');
  });
});

describe('FocusedEditor type list', () => {
  it('keeps the type list visible next to every mode, not only the list screen', () => {
    render(<FocusedEditor mode="edit" />);
    expect(screen.getByText('Item types')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'New type' })).toBeInTheDocument();
  });
});

describe('FocusedEditor field order', () => {
  it('offers move up and down instead of a drag handle', () => {
    render(<FocusedEditor mode="edit" />);
    const up = screen.getByRole('button', { name: 'Move Manufacturer up' });
    const down = screen.getByRole('button', { name: 'Move Manufacturer down' });
    expect(up).toBeDisabled();
    expect(down).toBeEnabled();
  });
});

describe('FocusedEditor computed field interaction', () => {
  it('opens the computed builder inline when the switch is on, instead of a Computation tab', () => {
    render(<FocusedEditor mode="computed" />);
    expect(screen.queryByRole('tab', { name: 'Computation' })).toBeNull();
    expect(screen.getByRole('switch', { name: 'Computed field' })).toBeChecked();
    expect(screen.getByRole('region', { name: 'Selected node' })).toBeInTheDocument();
  });

  it('leaves the computed switch off for an ordinary stored field', () => {
    render(<FocusedEditor mode="edit" />);
    expect(screen.getByRole('switch', { name: 'Computed field' })).not.toBeChecked();
  });
});

describe('FocusedEditor field form footer', () => {
  it('offers per-field save and archive instead of a type-level save draft', () => {
    render(<FocusedEditor mode="edit" />);
    expect(screen.getByRole('button', { name: 'Save field' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Archive field' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Save draft' })).toBeNull();
  });
});
