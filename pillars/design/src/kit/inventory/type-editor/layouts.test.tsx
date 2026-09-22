import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FocusedEditor } from './layouts';

afterEach(cleanup);

describe('FocusedEditor publish state', () => {
  it('does not offer direct publishing when a replacement migration is required', () => {
    render(<FocusedEditor mode="migration" />);

    expect(screen.getByText('Replacement ready; migration required')).toBeInTheDocument();
    expect(screen.queryByText(/no migration required/u)).toBeNull();
  });

  it('offers direct publishing for a compatible edit', () => {
    render(<FocusedEditor mode="edit" />);

    expect(screen.getByText(/no migration required/u)).toBeInTheDocument();
  });
});
