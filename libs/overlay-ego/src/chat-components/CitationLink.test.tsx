import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { CitationLink } from './CitationLink';

describe('CitationLink', () => {
  it('links to the cerebrum engram detail route', () => {
    render(
      <MemoryRouter>
        <CitationLink engramId="eng_1" />
      </MemoryRouter>
    );

    expect(screen.getByRole('link', { name: 'eng_1' })).toHaveAttribute(
      'href',
      '/cerebrum/engrams/eng_1'
    );
  });
});
