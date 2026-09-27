import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';

import { useSelection } from '../../foundation/selection/use-selection.js';
import { useFixtureDetailActions } from './fixture-detail-actions.js';
import { FixtureDetailView } from './fixture-detail-view.js';
import { useFixtureDetailPageModel } from './fixtures-page-model.js';

import type { ReactElement } from 'react';

/** Renders fixture facts and the wired-item connection controls for one route id. */
export function FixtureDetailPage(): ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const model = useFixtureDetailPageModel(id);
  const navigate = useNavigate();
  const [editOpen, setEditOpen] = useState(false);
  const [wireOpen, setWireOpen] = useState(false);
  const order = useMemo(() => model.items.items.map((item) => item.id), [model.items.items]);
  const selection = useSelection(order);
  const wiredIds = useMemo(() => new Set(order), [order]);
  const actions = useFixtureDetailActions({ model, fixture: model.fixture, selection });
  return (
    <FixtureDetailView
      model={model}
      selection={selection}
      wiredIds={wiredIds}
      editOpen={editOpen}
      wireOpen={wireOpen}
      onEditOpenChange={setEditOpen}
      onWireOpenChange={setWireOpen}
      actions={actions}
      onOpenItem={(itemId) => void navigate(`/inventory/items/${itemId}`)}
    />
  );
}
