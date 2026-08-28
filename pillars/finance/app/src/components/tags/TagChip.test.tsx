import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TagBadge, TagBadgeRow, TagChip } from './TagChip';

const FACETED_ROW = ['venue:bar', 'occasion:out', 'contains:alcohol'];

describe('TagChip', () => {
  it('shows the value and never the facet prefix', () => {
    render(<TagChip tag="venue:bar" />);

    expect(screen.getByText('Bar')).toBeInTheDocument();
    expect(screen.queryByText(/venue:bar/)).toBeNull();
  });

  it('names the facet in the accessible label, so it is discoverable without a prefix', () => {
    render(<TagChip tag="venue:bar" />);

    expect(screen.getByLabelText('Venue: Bar')).toBeInTheDocument();
  });

  it('keeps the stored string in the DOM for debugging', () => {
    render(<TagChip tag="venue:bar" />);

    const chip = screen.getByLabelText('Venue: Bar');
    expect(chip).toHaveAttribute('data-tag', 'venue:bar');
    expect(chip.getAttribute('title')).toContain('venue:bar');
  });

  it('renders an unprefixed legacy tag as its bare value without throwing', () => {
    expect(() => render(<TagChip tag="Groceries" />)).not.toThrow();

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByLabelText('Groceries')).toBeInTheDocument();
  });

  it('names the tag on its remove button', () => {
    render(<TagChip tag="venue:bar" removable onRemove={() => {}} />);

    expect(screen.getByRole('button', { name: 'Remove Venue: Bar' })).toBeInTheDocument();
  });
});

describe('TagBadge', () => {
  it('shows the value and names the facet', () => {
    render(<TagBadge tag="contains:party-supplies" />);

    expect(screen.getByText('Party supplies')).toBeInTheDocument();
    expect(screen.getByLabelText('Contains: Party supplies')).toBeInTheDocument();
  });

  it('renders an unprefixed legacy tag without throwing', () => {
    expect(() => render(<TagBadge tag="Online" />)).not.toThrow();
    expect(screen.getByText('Online')).toBeInTheDocument();
  });
});

describe('TagBadgeRow', () => {
  it('renders a mixed-axis row as one chip per tag, grouped by facet, none prefixed', () => {
    const { container } = render(<TagBadgeRow tags={FACETED_ROW} />);

    const badges = within(container).getAllByText(/.+/, { selector: '[data-tag]' });
    expect(badges.map((badge) => badge.textContent)).toEqual(['Alcohol', 'Out', 'Bar']);
    expect(container.textContent).not.toContain(':');
  });

  it('orders axes identically whatever order the tags were stored in', () => {
    const forward = render(<TagBadgeRow tags={FACETED_ROW} />);
    const reversed = render(<TagBadgeRow tags={[...FACETED_ROW].toReversed()} />);

    expect(reversed.container.textContent).toBe(forward.container.textContent);
  });

  it('collapses the overflow past the limit', () => {
    render(<TagBadgeRow tags={[...FACETED_ROW, 'venue:cafe']} limit={3} />);

    expect(screen.getAllByText(/.+/, { selector: '[data-tag]' })).toHaveLength(3);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('sorts an unfaceted legacy tag last without dropping it', () => {
    const { container } = render(<TagBadgeRow tags={['Legacy', 'venue:bar']} />);

    const badges = within(container).getAllByText(/.+/, { selector: '[data-tag]' });
    expect(badges.map((badge) => badge.textContent)).toEqual(['Bar', 'Legacy']);
  });
});
