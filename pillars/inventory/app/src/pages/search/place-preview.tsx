import { MapPin } from 'lucide-react';

import { Button } from '@pops/ui';

import { locationPath } from '../../foundation/model/placement-model.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';
import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { useItemRows } from '../../inventory-web/useWebItems.js';
import { PreviewFrame, PreviewList, renderPreviewListRows } from './preview-parts.js';

import type { ReactElement } from 'react';

import type { LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

/** Props for a place preview. */
export interface PlacePreviewProps {
  place: LocationModel;
  path: string;
  onOpen: () => void;
  onStoreHere: () => void;
  /** Explains why Store here is unavailable, such as while offline. */
  disabledReason?: string;
}

type LegacyPlacePreviewProps = {
  place: LocationModel;
  world: PlacementWorld;
  onOpen: () => void;
  onStoreHere: () => void;
};

function StoreHereAction({
  disabledReason,
  onStoreHere,
}: {
  disabledReason: string | undefined;
  onStoreHere: () => void;
}): ReactElement {
  const disabled = disabledReason !== undefined;
  const button = (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-disabled={disabled || undefined}
      className={disabled ? 'opacity-50' : undefined}
      onClick={disabled ? undefined : onStoreHere}
    >
      Store here
    </Button>
  );
  if (disabledReason === undefined) return button;
  return (
    <HintTooltip label="Store here" disabledReason={disabledReason}>
      {button}
    </HintTooltip>
  );
}

function PlaceContents({ place }: { place: LocationModel }): ReactElement {
  const contents = useItemRows({ locationId: place.id, placementKind: 'location' }, 50);
  const count = contents.total ?? contents.rows.length;
  return (
    <PreviewList title="Directly here" count={count} empty="Nothing is directly here.">
      {renderPreviewListRows({
        status: contents.status,
        rows: contents.rows,
        refetch: contents.refetch,
      })}
    </PreviewList>
  );
}

function PlacePreviewView({
  place,
  path,
  onOpen,
  onStoreHere,
  disabledReason,
}: PlacePreviewProps): ReactElement {
  return (
    <PreviewFrame
      mark={
        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <MapPin className="size-5" aria-hidden />
        </span>
      }
      title={place.name}
      where={
        <span className="text-xs text-muted-foreground">{path === '' ? 'Top level' : path}</span>
      }
      actions={
        <>
          <Button type="button" size="sm" suffix={<ShortcutHint id="list-open" />} onClick={onOpen}>
            Open place
          </Button>
          <StoreHereAction disabledReason={disabledReason} onStoreHere={onStoreHere} />
        </>
      }
    >
      <PlaceContents place={place} />
    </PreviewFrame>
  );
}

function LegacyPlacePreview({
  place,
  world,
  onOpen,
  onStoreHere,
}: LegacyPlacePreviewProps): ReactElement {
  const path = locationPath(world, place.id)
    .slice(0, -1)
    .map((location) => location.name)
    .join(' › ');
  return <PlacePreviewView place={place} path={path} onOpen={onOpen} onStoreHere={onStoreHere} />;
}

/** Renders a place preview with its direct contents and Store here action. */
export function PlacePreview(props: PlacePreviewProps): ReactElement;
export function PlacePreview(props: LegacyPlacePreviewProps): ReactElement;
export function PlacePreview(props: PlacePreviewProps | LegacyPlacePreviewProps): ReactElement {
  return 'path' in props ? <PlacePreviewView {...props} /> : <LegacyPlacePreview {...props} />;
}
