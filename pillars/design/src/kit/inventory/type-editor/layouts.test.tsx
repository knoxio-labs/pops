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
});
