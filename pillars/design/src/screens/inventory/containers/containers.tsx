import {
  browseInventory,
  browseWorld,
  placeOptions,
  typeOptions,
} from '@/fixtures/inventory/items-browse';
import { ContainersPage } from '@/kit/inventory/containers-browser/containers-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ContainersPageProps } from '@/kit/inventory/containers-browser/containers-page';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Containers', order: 20, frame: 'web' };

const containerTypes = typeOptions.filter(
  (option) => option.value === 'type-box' || option.value === 'type-tub'
);

function Containers(props: Partial<ContainersPageProps>): ReactNode {
  return (
    <ContainersPage
      items={browseInventory}
      world={browseWorld}
      types={containerTypes}
      places={placeOptions.filter((option) => option.value.startsWith('loc-'))}
      {...props}
    />
  );
}

/**
 * `/inventory/containers`: every container, by state. A container opens at
 * `/inventory/items/:id` like any item (owner decision 2), in its contents
 * first layout. Moving day leads with packing progress and lists what is
 * still open first.
 */
export const states: ScreenStates = {
  all: () => <Containers />,
  open: () => <Containers segment="open" />,
  closed: () => <Containers segment="closed" />,
  full: () => <Containers segment="full" />,
  retired: () => <Containers segment="retired" />,
  moving: () => <Containers segment="moving" />,
  selected: () => (
    <Containers
      segment="open"
      seed={{ selected: ['box-k13', 'box-cables', 'mb-03'], focusedId: 'box-cables' }}
    />
  ),
  'empty-filtered': () => <Containers segment="full" seed={{ filters: { q: 'wardrobe' } }} />,
  empty: () => <Containers items={[]} />,
  loading: () => <Containers status="loading" />,
  offline: () => <Containers offline seed={{ selected: ['box-k13'] }} />,
  error: () => <Containers status="error" />,
};

export default function ContainersScreen(): ReactNode {
  return <Containers />;
}
