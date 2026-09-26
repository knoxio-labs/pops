import {
  deskTarget,
  kitchen13Target,
  linen02Target,
  multiPick,
  office04Target,
  storeWorld,
} from '../test-fixtures/store-here';
import { storeCandidates } from './store-here-model';
import { StoreHereSheetPanel } from './store-here-view';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { StoreHereTarget } from '../model/contracts';

const meta = {
  title: 'Inventory/Foundation/StoreHere',
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof StoreHereSheetPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const EMPTY_IDS: readonly string[] = [];
const EMPTY_NAMES: readonly string[] = [];

interface StoreHereStoryProps {
  target: StoreHereTarget;
  initialTab: 'new' | 'existing';
  query?: string;
  selected?: readonly string[];
  created?: readonly string[];
  offline?: boolean;
}

function StoreHereStory({
  target,
  initialTab,
  query = '',
  selected = EMPTY_IDS,
  created = EMPTY_NAMES,
  offline = false,
}: StoreHereStoryProps) {
  return (
    <div className="mx-auto h-screen w-full max-w-xl p-4">
      <StoreHereSheetPanel
        target={target}
        world={storeWorld}
        status="success"
        onRetry={() => undefined}
        candidates={storeCandidates(storeWorld, target, query)}
        initialTab={initialTab}
        query={query}
        onQuery={() => undefined}
        selected={new Set(selected)}
        onToggle={() => undefined}
        created={created}
        onCreate={() => Promise.resolve(true)}
        createError={null}
        onStoreExisting={() => undefined}
        onOpenTarget={() => undefined}
        onOpenForm={() => undefined}
        onDone={() => undefined}
        offline={offline}
        busy={false}
        className="w-full rounded-xl"
      />
    </div>
  );
}

export const NewTab: Story = {
  render: () => (
    <StoreHereStory
      target={kitchen13Target}
      initialTab="new"
      created={['Milk frother', 'Tea towels']}
    />
  ),
};

export const ExistingTab: Story = {
  render: () => <StoreHereStory target={kitchen13Target} initialTab="existing" />,
};

export const ExistingSearch: Story = {
  render: () => <StoreHereStory target={kitchen13Target} initialTab="existing" query="cable" />,
};

export const ExistingMultiPick: Story = {
  render: () => (
    <StoreHereStory target={kitchen13Target} initialTab="existing" selected={multiPick} />
  ),
};

export const ExistingCarriesContents: Story = {
  render: () => (
    <StoreHereStory
      target={deskTarget}
      initialTab="existing"
      query="tub"
      selected={['box-cables']}
    />
  ),
};

export const NoMatches: Story = {
  render: () => <StoreHereStory target={kitchen13Target} initialTab="existing" query="snorkel" />,
};

export const TargetClosed: Story = {
  render: () => <StoreHereStory target={office04Target} initialTab="existing" />,
};

export const TargetFull: Story = {
  render: () => (
    <StoreHereStory target={linen02Target} initialTab="existing" selected={['itm-sheets']} />
  ),
};

export const PlaceTarget: Story = {
  render: () => <StoreHereStory target={deskTarget} initialTab="new" />,
};

export const Offline: Story = {
  render: () => <StoreHereStory target={kitchen13Target} initialTab="existing" offline />,
};
