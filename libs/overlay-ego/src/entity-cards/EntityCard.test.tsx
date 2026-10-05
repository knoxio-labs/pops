import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';

import { EntityCard } from './EntityCard';

import type { EntityPart } from '../chat-hooks/message-parts';

function entityPart(uri: string, title: string, subtitle?: string): EntityPart {
  return {
    type: 'entity',
    uri,
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
  };
}

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="pathname">{location.pathname}</output>;
}

function renderCard(part: EntityPart) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <EntityCard part={part} />
      <LocationProbe />
    </MemoryRouter>
  );
}

describe('EntityCard', () => {
  it('navigates to the resolved URI route when the card is clicked', async () => {
    const user = userEvent.setup();
    renderCard(entityPart('pops:media/movie/42', 'Arrival'));

    await user.click(screen.getByRole('button', { name: 'Movie: Arrival' }));

    expect(screen.getByTestId('pathname')).toHaveTextContent('/media/movies/42');
  });

  it('shows unknown entities in a non-interactive card', () => {
    renderCard(entityPart('pops:foo/bar/1', 'Unknown entity'));

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Unknown entity')).toBeInTheDocument();
    expect(screen.getByText('Unknown entity').closest('[data-slot="entity-card"]')?.tagName).toBe(
      'DIV'
    );
  });

  it('keeps purchase items non-interactive when their URI lacks the order context', () => {
    renderCard(entityPart('pops:purchases/purchase-item/line-1', 'Line item'));

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText('Purchase item')).toBeInTheDocument();
  });

  it('renders a subtitle when present', () => {
    renderCard(entityPart('pops:media/movie/42', 'Arrival', 'A science fiction film'));

    expect(screen.getByText('A science fiction film')).toBeInTheDocument();
  });

  it('omits the subtitle when it is absent', () => {
    renderCard(entityPart('pops:media/movie/42', 'Arrival'));

    expect(screen.queryByText('A science fiction film')).not.toBeInTheDocument();
  });

  it('shows the type label for the URI variant', () => {
    renderCard(entityPart('pops:media/movie/42', 'Arrival'));

    expect(screen.getByText('Movie')).toBeInTheDocument();
  });
});
