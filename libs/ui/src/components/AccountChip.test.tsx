import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AccountChip, AccountMark } from './AccountChip';

import type { AccountOption } from './account-shared/types';

const WITH_LOGO: AccountOption = {
  id: 'a1',
  name: 'Everyday',
  kind: 'checking',
  institution: {
    id: 'anz',
    name: 'ANZ',
    colour: '#0072ac',
    logoUrl: 'https://example.com/anz.svg',
  },
};

const WITHOUT_LOGO: AccountOption = {
  id: 'a2',
  name: 'Offset',
  kind: 'savings',
  institution: { id: 'ing', name: 'ING', colour: '#ff6200' },
};

const NO_INSTITUTION: AccountOption = {
  id: 'a3',
  name: 'Wallet',
  kind: 'cash',
};

describe('AccountMark — identity fallback chain', () => {
  it('renders the institution logo when one has been resolved', () => {
    const { container } = render(<AccountMark account={WITH_LOGO} />);
    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://example.com/anz.svg');
  });

  it('falls back to the institution initials on its brand colour when there is no logo', () => {
    const { container } = render(<AccountMark account={WITHOUT_LOGO} />);
    expect(container.querySelector('img')).not.toBeInTheDocument();
    const mark = screen.getByText('IN');
    expect(mark).toHaveStyle({ backgroundColor: '#ff6200' });
  });

  it('falls back to the kind icon when the account has no institution at all', () => {
    const { container } = render(<AccountMark account={NO_INSTITUTION} />);
    expect(screen.queryByText('IN')).not.toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('AccountChip — compact size', () => {
  it('shows the account name and marks it archived', () => {
    render(<AccountChip account={{ ...WITH_LOGO, archived: true }} />);
    expect(screen.getByText('Everyday')).toBeInTheDocument();
    expect(screen.getByText('(archived)')).toBeInTheDocument();
  });

  it('is silent about archival for an active account', () => {
    render(<AccountChip account={WITH_LOGO} />);
    expect(screen.queryByText('(archived)')).not.toBeInTheDocument();
  });
});

describe('AccountChip — full size', () => {
  it('subtitles with the institution name when there is one', () => {
    render(<AccountChip account={WITHOUT_LOGO} size="full" />);
    expect(screen.getByText('ING')).toBeInTheDocument();
  });

  it('subtitles with the kind label when there is no institution', () => {
    render(<AccountChip account={NO_INSTITUTION} size="full" />);
    expect(screen.getByText('Cash')).toBeInTheDocument();
  });

  it('shows an Archived badge instead of the parenthetical used by compact/inline', () => {
    render(<AccountChip account={{ ...NO_INSTITUTION, archived: true }} size="full" />);
    expect(screen.getByText('Archived')).toBeInTheDocument();
    expect(screen.queryByText('(archived)')).not.toBeInTheDocument();
  });
});
