import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccountLabel } from './AccountLabel';

import type { AccountOption } from '@pops/ui';

const EVERYDAY: AccountOption = { id: 'a1', name: 'Up Everyday', kind: 'checking' };

describe('AccountLabel', () => {
  it('renders the account chip once the id resolves', () => {
    render(<AccountLabel accounts={[EVERYDAY]} account="a1" />);
    expect(screen.getByText('Up Everyday')).toBeInTheDocument();
  });

  it('renders the account chip once a pre-cutover name resolves', () => {
    render(<AccountLabel accounts={[EVERYDAY]} account="Up Everyday" />);
    expect(screen.getByText('Up Everyday')).toBeInTheDocument();
  });

  it('falls back to the plain string while accounts are still loading', () => {
    render(<AccountLabel accounts={undefined} account="Up Everyday" />);
    expect(screen.getByText('Up Everyday')).toBeInTheDocument();
  });

  it('falls back to the plain string when nothing resolves', () => {
    render(<AccountLabel accounts={[EVERYDAY]} account="Brand New Bank" />);
    expect(screen.getByText('Brand New Bank')).toBeInTheDocument();
  });
});
