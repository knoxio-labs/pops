import { useNavigate } from 'react-router';

import { useOnline } from '../../inventory-web/useOnline.js';
import { StoreHereSheetView } from './store-here-view.js';
import { useStoreHere } from './use-store-here.js';

import type { ReactElement } from 'react';

import type { StoreHereTarget } from '../model/contracts.js';

/** Props accepted by the live Store here sheet. */
export interface StoreHereSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: StoreHereTarget;
  initialTab?: 'new' | 'existing';
  /** An opener may force the mutation-disabled state for a degraded page. */
  offline?: boolean;
}

/** The controlled props used by pages that do not need the compatibility override. */
export type StoreHereSheetOpenProps = Pick<
  StoreHereSheetProps,
  'open' | 'onOpenChange' | 'target' | 'initialTab'
>;

function StoreHereSheetContent(props: StoreHereSheetProps): ReactElement {
  const online = useOnline();
  const data = useStoreHere(props.target);
  const navigate = useNavigate();
  const offline = props.offline === true || !online;

  return (
    <StoreHereSheetView
      open
      onOpenChange={props.onOpenChange}
      target={props.target}
      world={data.world}
      status={data.status}
      onRetry={data.retry}
      candidates={data.candidates}
      initialTab={props.initialTab}
      query={data.query}
      onQuery={data.setQuery}
      selected={data.selected}
      onToggle={data.toggle}
      created={data.created}
      onCreate={data.create}
      createError={data.createError}
      onStoreExisting={data.store}
      onOpenTarget={data.openTarget}
      onOpenForm={() => {
        void navigate(`/inventory/items/new?in=${encodeURIComponent(props.target.id)}`);
      }}
      onDone={() => props.onOpenChange(false)}
      offline={offline}
      busy={data.busy}
    />
  );
}

/** Renders the live Store here sheet only after it opens, so closed sheets fetch nothing. */
export function StoreHereSheet(props: StoreHereSheetProps): ReactElement | null {
  if (!props.open) return null;
  return (
    <StoreHereSheetContent
      key={`${props.target.kind}:${props.target.id}:${props.initialTab ?? 'new'}`}
      {...props}
    />
  );
}
