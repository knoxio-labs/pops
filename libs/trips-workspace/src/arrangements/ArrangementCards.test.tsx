import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ArrangementCard } from './ArrangementCards';
import { labels, sourceRental } from './test-utils';

import type { Rental } from './types';

afterEach(cleanup);
describe('Arrangement source purchase treatment', () => {
  it.each<Rental['status']>([null, 'Considering', 'Reserved', 'Purchased'])(
    'uses hard treatment only for actual Purchased source state, received %s',
    (status) => {
      render(
        <ArrangementCard
          row={{ kind: 'rental', source: sourceRental({ status }), visitId: 31 }}
          sources={{ legs: new Map() }}
          identity={{ tripId: 7, labels, formatDate: (value) => value }}
          open={vi.fn()}
        />
      );
      const action = screen.getByRole('button', { name: /Harbour cars/ });
      if (status === 'Purchased') expect(action).toHaveClass('border-solid', 'border-l-app-accent');
      else {
        expect(action).not.toHaveClass('border-solid');
        expect(action).not.toHaveClass('border-l-app-accent');
      }
    }
  );
});
