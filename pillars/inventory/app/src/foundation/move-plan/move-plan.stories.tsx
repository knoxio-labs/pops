import { coreWorld } from '../test-fixtures/core';
import { bulkMoveIds, closedBoxTarget, shelvingTarget } from '../test-fixtures/placements';
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

function Frame({ children }: { children: ReactNode }) {
  return <div className="mx-auto w-full max-w-md rounded-xl border bg-card p-4">{children}</div>;
}

function Specimen({ label, note, children }: { label: string; note: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      <Frame>{children}</Frame>
    </div>
  );
}

export const MovePlan: Story = {
  render: () => (
    <div className="grid gap-4 lg:grid-cols-2">
      <Specimen label="Move plan" note="Carried contents and refusals before the button.">
        <MovePlanPanel
          plan={planMove({ world: coreWorld, selectedIds: bulkMoveIds, target: shelvingTarget })}
          world={coreWorld}
          onChangeTarget={() => undefined}
        />
      </Specimen>
      <Specimen label="Target refuses" note="Nothing moves; the fix is named.">
        <MovePlanPanel
          plan={planMove({ world: coreWorld, selectedIds: bulkMoveIds, target: closedBoxTarget })}
          world={coreWorld}
          onChangeTarget={() => undefined}
        />
      </Specimen>
    </div>
  ),
};
