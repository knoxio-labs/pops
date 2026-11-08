import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { CandidateCard } from './CandidateCard';
import { emptyChoices } from './model';

import type { ReviewCandidate } from './model';

const candidate: ReviewCandidate = {
  id: 'candidate',
  entityId: 'person/id',
  name: 'Marina',
  localName: 'Marina',
  sourceOptions: [],
  points: [],
  sources: [],
  reasons: [],
  keepSeparate: false,
};

it('opens materialized person details in a separate tab so current review selections remain intact', () => {
  render(
    <CandidateCard
      candidate={candidate}
      choices={emptyChoices()}
      disabled={false}
      onChange={vi.fn()}
    />
  );
  const link = screen.getByRole('link', { name: 'Person details (new tab)' });
  expect(link).toHaveAttribute('href', '/contacts/people/person%2Fid');
  expect(link).toHaveAttribute('target', '_blank');
  expect(link).toHaveAttribute('rel', 'noreferrer');
});

it('does not offer a persisted-person route for a source row awaiting import', () => {
  render(
    <CandidateCard
      candidate={{ ...candidate, entityId: null }}
      choices={emptyChoices()}
      disabled={false}
      onChange={vi.fn()}
    />
  );
  expect(screen.queryByRole('link', { name: 'Person details (new tab)' })).not.toBeInTheDocument();
});
