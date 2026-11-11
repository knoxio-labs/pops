import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { sourceRental } from '../arrangements/test-utils';
import { mountOverview } from './render.test-utils';
import { overviewResponses } from './test-utils';

afterEach(cleanup);

it.each(['Considering', 'Reserved', 'Purchased'] as const)(
  'projects one canonical %s Rental at exact pickup occurrence while retaining its independent return',
  async (status) => {
    const responses = overviewResponses();
    responses.set('/trips/7/rentals', {
      rentals: [
        sourceRental({ pickupVisitId: 31, returnVisitId: 32, provider: 'Exact car', status }),
      ],
    });
    const onOpenSource = vi.fn();
    mountOverview(responses, undefined, { onOpenSource });
    const card = await screen.findByRole('button', { name: 'Exact car' });
    expect(screen.getAllByRole('button', { name: 'Exact car' })).toHaveLength(1);
    expect(card.closest('[data-visit-id]')).toHaveAttribute('data-visit-id', '31');
    expect(card).toHaveTextContent('visit #32');
    expect(card.closest('article')).toHaveAttribute(
      'data-constraint',
      status === 'Purchased' ? 'hard' : 'soft'
    );
    fireEvent.click(card);
    expect(onOpenSource).toHaveBeenLastCalledWith({ kind: 'rental', id: 61 });
    expect(screen.queryByRole('link', { name: /Exact car/ })).not.toBeInTheDocument();
  }
);
