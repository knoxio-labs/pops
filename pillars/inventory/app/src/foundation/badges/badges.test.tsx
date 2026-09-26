import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { coreWorld, television } from '../test-fixtures/core';
import {
  CodeBadge,
  ConceptBadge,
  ContainerStateBadge,
  InHandBadge,
  LifecycleBadge,
  QuantityBadge,
  SyncBadge,
  TypeLabel,
} from './badges';
import { EventMark } from './event-mark';
import { ItemMark } from './item-mark';
import { PlacementPath } from './placement-path';

import type { EventModel } from '../model/model';

const event: EventModel = {
  id: 'evt-moved',
  itemId: television.id,
  itemName: television.name,
  kind: 'moved',
  at: '2026-09-20T09:00:00.000Z',
  actor: 'web',
  actorName: 'Web',
  summary: 'Moved to Kitchen',
  before: 'Living room',
  after: 'Kitchen',
  reason: null,
  undoable: true,
};

describe('badges', () => {
  it('draws nothing for the quiet cases', () => {
    const { container } = render(
      <>
        <CodeBadge code={null} />
        <QuantityBadge quantity={1} />
        <QuantityBadge quantity={0} />
        <LifecycleBadge lifecycle="active" />
        <SyncBadge sync="synced" />
        <ContainerStateBadge container={null} />
      </>
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('pairs every drawn badge with its word', () => {
    render(
      <div>
        <ConceptBadge concept="item" label="Item" />
        <CodeBadge code="K12" />
        <CodeBadge code={null} showNone />
        <QuantityBadge quantity={3} />
        <TypeLabel typeName="Electronics" />
        <TypeLabel typeName={null} />
        <LifecycleBadge lifecycle="retired" />
        <SyncBadge sync="queued" />
        <SyncBadge sync="stale" />
        <SyncBadge sync="needs-attention" />
        <ContainerStateBadge container={{ access: 'open', full: true }} />
        <ContainerStateBadge container={{ access: 'closed', full: false }} />
        <InHandBadge />
      </div>
    );

    for (const label of [
      'Item',
      'K12',
      'No code',
      '×3',
      'Electronics',
      'Untyped',
      'Retired',
      'Queued',
      'Changed elsewhere',
      'Needs attention',
      'Open',
      'Full',
      'Closed',
      'In hand',
    ]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText('Code')).toHaveClass('sr-only');
  });

  it('spins the Saving icon only under motion-safe', () => {
    render(<SyncBadge sync="sending" />);

    const badge = screen.getByText('Saving').closest('[data-slot="badge"]');
    expect(badge).not.toBeNull();
    const classes = badge?.className.split(/\s+/) ?? [];
    expect(classes).toContain('[&>svg]:motion-safe:animate-spin');
    expect(classes).not.toContain('animate-spin');
  });

  it('ItemMark falls back to the symbol and says the photo did not load after an image error', () => {
    const item = { ...television, photoUrl: '/photos/television.jpg' };
    const { container } = render(<ItemMark item={item} size="md" />);

    const image = container.querySelector('img');
    if (image === null) throw new Error('ItemMark did not render its photo');
    fireEvent.error(image);

    expect(container.querySelector('img')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Photo did not load')).toBeInTheDocument();
    expect(screen.getByTitle('Photo did not load')).toBeInTheDocument();
  });

  it('EventMark renders the event concept in its muted tile', () => {
    const { container } = render(<EventMark event={event} className="custom-mark" />);

    expect(container.firstElementChild).toHaveClass('size-7', 'bg-muted', 'custom-mark');
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('PlacementPath strikes through a deleted previous place and says (deleted)', () => {
    render(<PlacementPath world={coreWorld} placement={{ kind: 'deleted', name: 'Spare room' }} />);

    expect(screen.getByText('Spare room', { selector: '.line-through' })).toHaveClass(
      'line-through'
    );
    expect(screen.getByText('(deleted)')).toBeInTheDocument();
  });

  it('PlacementPath keeps the full path in its title while folding the visible segments', () => {
    const { container } = render(
      <PlacementPath
        world={coreWorld}
        placement={{ kind: 'container', containerId: 'box-parts' }}
      />
    );
    const full = 'Wattle Street house › Garage › Shelving › Cable tub › Small parts case';
    const path = container.firstElementChild;

    expect(path).toHaveAttribute('title', full);
    expect(screen.getByText(full)).toHaveClass('sr-only');
    expect(screen.getByText('…')).toBeInTheDocument();
    expect(path?.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.queryByText('Wattle Street house', { selector: ':not(.sr-only)' })).toBeNull();
  });
});
