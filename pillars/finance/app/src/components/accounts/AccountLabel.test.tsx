import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { AccountLabel } from './AccountLabel';

import type { AccountOption } from '@pops/ui';

const EVERYDAY: AccountOption = { id: 'a1', name: 'Up Everyday', kind: 'checking' };

function renderLabel(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe('AccountLabel', () => {
  it('renders the account chip as a link to its account page once the id resolves', () => {
    renderLabel(<AccountLabel accounts={[EVERYDAY]} account="a1" />);
    expect(screen.getByText('Up Everyday')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/finance/accounts/a1');
  });

  it('renders the account chip once a pre-cutover name resolves', () => {
    renderLabel(<AccountLabel accounts={[EVERYDAY]} account="Up Everyday" />);
    expect(screen.getByText('Up Everyday')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/finance/accounts/a1');
  });

  it('falls back to the plain string while accounts are still loading, with no link', () => {
    renderLabel(<AccountLabel accounts={undefined} account="Up Everyday" />);
    expect(screen.getByText('Up Everyday')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('falls back to the plain string when nothing resolves, with no link', () => {
    renderLabel(<AccountLabel accounts={[EVERYDAY]} account="Brand New Bank" />);
    expect(screen.getByText('Brand New Bank')).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });
});
