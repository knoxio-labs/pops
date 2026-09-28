import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../../../foundation/model/placement-model.js';
import { box } from '../../../foundation/test-fixtures/core-factory.js';
import { ContainerWorkspace } from './workspace.js';

import type { ItemDetailModel } from '../detail-model.js';

const mocks = vi.hoisted(() => ({ useContainerContents: vi.fn() }));

vi.mock('./use-container-contents.js', () => ({
  useContainerContents: mocks.useContainerContents,
}));
vi.mock('./workspace-body.js', () => ({
  ContainerWorkspaceBody: () => <div data-testid="workspace-body" />,
}));

const container = box(
  ['container-1', 'Archive box', 'box'],
  { kind: 'location', locationId: 'study' },
  'open'
);
const world = buildWorld(
  [container],
  [{ id: 'study', name: 'Study', parentId: null, kind: 'room' }]
);
const model: ItemDetailModel = {
  item: container,
  world,
  relatedWorld: world,
  aggregate: {
    facts: [],
    type: null,
    fieldValues: [],
    provenance: {
      purchasedOn: null,
      pricePaid: null,
      merchant: null,
      warrantyUntil: null,
      purchase: null,
    },
    photos: [],
  },
  documents: [],
  paperless: 'not-configured',
  paperlessBaseUrl: null,
  connections: [],
  events: [],
  eventCount: 0,
};

describe('ContainerWorkspace', () => {
  it('keeps the workspace in the detail body height budget', () => {
    mocks.useContainerContents.mockReturnValue({
      rows: [],
      world,
      contentCounts: {},
      status: 'success',
      error: null,
      refetch: vi.fn(),
    });

    render(
      <ContainerWorkspace
        model={model}
        placementWorld={world}
        recents={[]}
        createPlace={async () => undefined}
        readOnly={false}
        offline={false}
        onLinksChanged={vi.fn()}
        storeHereOpen={false}
        onStoreHereChange={vi.fn()}
        storeTarget={{ kind: 'container', id: container.id, name: container.name, state: 'open' }}
      />
    );

    const body = screen.getByTestId('workspace-body');
    const frame = body.parentElement;
    if (frame === null) throw new Error('Container workspace frame was not rendered');
    expect(frame).toHaveClass('@container', 'flex', 'min-h-0', 'flex-1', 'flex-col', 'gap-3');
  });
});
