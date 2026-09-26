import { buildWorld } from '../model/placement-model';
import { coreWorld } from '../test-fixtures/core';
import { at, box } from '../test-fixtures/core-factory';
import { closedBoxTarget, deskTarget } from '../test-fixtures/placements';
import { MovePlanPanel } from './move-plan';
import { planMove } from './move-plan-model';

import type { Meta, StoryObj } from '@storybook/react-vite';
import type { ReactNode } from 'react';

const meta = {
  title: 'Inventory/Foundation/MovePlan',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const fullContainer = box(['full', 'Full box', 'type-box'], at('loc-garage'), 'open', {
  full: true,
});
const fullWorld = buildWorld(
  [...coreWorld.items.values(), fullContainer],
  [...coreWorld.locations.values()]
);
const fullTarget = { kind: 'container', containerId: 'full' } as const;

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-4">{children}</div>;
}

export const Applicable: Story = {
  render: () => (
    <Frame>
      <MovePlanPanel
        plan={planMove({ world: coreWorld, selectedIds: ['box-cables'], target: deskTarget })}
        world={coreWorld}
      />
    </Frame>
  ),
};

export const ClosedTarget: Story = {
  render: () => (
    <Frame>
      <MovePlanPanel
        plan={planMove({ world: coreWorld, selectedIds: ['itm-lamp'], target: closedBoxTarget })}
        world={coreWorld}
      />
    </Frame>
  ),
};

export const FullTarget: Story = {
  render: () => (
    <Frame>
      <MovePlanPanel
        plan={planMove({ world: fullWorld, selectedIds: ['itm-lamp'], target: fullTarget })}
        world={fullWorld}
      />
    </Frame>
  ),
};
