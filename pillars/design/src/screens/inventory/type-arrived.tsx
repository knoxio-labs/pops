import { coreWorld } from '@/fixtures/inventory/core';
import { aquariumType, gardenType, untypedItems } from '@/fixtures/inventory/type-arrived';
import { TypeArrivedPage } from '@/kit/inventory/type-arrived/type-arrived-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { TypeArrivedPageProps } from '@/kit/inventory/type-arrived/type-arrived-page';

export const meta: ScreenMeta = { title: 'Type arrived', order: 10, frame: 'web' };

const base: TypeArrivedPageProps = { type: gardenType, untyped: untypedItems, world: coreWorld };

function page(props: Partial<TypeArrivedPageProps>) {
  return function TypeArrivedState() {
    return <TypeArrivedPage {...base} {...props} />;
  };
}

/**
 * `/inventory/types/:id/arrived`: Garden arrives and claims five untyped
 * items. Review (all ticked, one unticked), applied with Undo, Not now,
 * a type that matches nothing, and loading.
 */
export const states: ScreenStates = {
  review: page({}),
  'one-unticked': page({ unticked: ['itm-gloves'] }),
  applied: page({ stage: 'applied', unticked: ['itm-gloves'] }),
  'not-now': page({ stage: 'not-now' }),
  'nothing-matched': page({ type: aquariumType }),
  loading: page({ stage: 'loading' }),
};

export default page({});
