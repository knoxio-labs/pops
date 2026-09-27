import { Button, cn } from '@pops/ui';

import { PlacementPicker } from '../../foundation/placement-picker/placement-picker';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip';
import { LegacyHeaderActions } from './legacy-header-actions';
import { MoreMenu } from './more-menu';

import type { ReactElement } from 'react';

import type { PlacementTarget, PlacementWorld } from '../../foundation/model';
import type { DetailVerb, DetailVerbs, MenuEntry } from './detail-verbs';
import type { LegacyHeaderActionsProps } from './legacy-header-actions';

export type { LegacyHeaderActionsProps } from './legacy-header-actions';

/** Props for the verb-driven item-detail header. */
export interface HeaderActionsProps {
  itemId: string;
  verbs: DetailVerbs;
  world: PlacementWorld;
  recents: readonly PlacementTarget[];
  menuOpen?: boolean;
  pickerOpen: boolean;
  onPickerOpenChange: (open: boolean) => void;
  onVerb?: (verb: DetailVerb) => void;
  onMenu?: (entry: MenuEntry) => void;
  onPick?: (target: PlacementTarget) => void;
  onCreatePlace?: (name: string, parentId: string | null) => Promise<void>;
}

function DetailVerbButton({
  verb,
  primary,
  onClick,
}: {
  verb: DetailVerb;
  primary: boolean;
  onClick: () => void;
}): ReactElement {
  const Icon = verb.icon;
  const refused = verb.disabledReason !== undefined;
  const button = (
    <Button
      size="default"
      variant={primary ? 'default' : 'outline'}
      className={cn('whitespace-nowrap', refused && 'opacity-50')}
      prefix={<Icon className="size-4" aria-hidden />}
      aria-disabled={refused || undefined}
      onClick={refused ? undefined : onClick}
    >
      {verb.label}
    </Button>
  );

  return (
    <HintTooltip
      label={verb.detail === undefined ? verb.label : `${verb.label}. ${verb.detail}`}
      shortcutId={verb.shortcutId}
      disabledReason={verb.disabledReason}
    >
      {button}
    </HintTooltip>
  );
}

function MoveVerb({ props, button }: { props: HeaderActionsProps; button: ReactElement }) {
  return (
    <PlacementPicker
      trigger={<span className="inline-flex">{button}</span>}
      open={props.pickerOpen}
      onOpenChange={props.onPickerOpenChange}
      world={props.world}
      subject={{ kind: 'items', ids: [props.itemId] }}
      recents={props.recents}
      onPick={(target) => {
        props.onPickerOpenChange(false);
        props.onPick?.(target);
      }}
      onCreatePlace={props.onCreatePlace}
    />
  );
}

function VerbHeaderActions(props: HeaderActionsProps): ReactElement {
  const renderVerb = (verb: DetailVerb, primary: boolean): ReactElement => {
    const button = (
      <DetailVerbButton verb={verb} primary={primary} onClick={() => props.onVerb?.(verb)} />
    );
    return verb.id === 'move' && verb.disabledReason === undefined ? (
      <MoveVerb key={verb.id} props={props} button={button} />
    ) : (
      <span key={verb.id} className="inline-flex">
        {button}
      </span>
    );
  };

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {props.verbs.primary ? renderVerb(props.verbs.primary, true) : null}
      {props.verbs.secondary.map((verb) => renderVerb(verb, false))}
      {props.verbs.edit ? renderVerb(props.verbs.edit, false) : null}
      {props.verbs.menu.length > 0 ? (
        <MoreMenu groups={props.verbs.menu} defaultOpen={props.menuOpen} onSelect={props.onMenu} />
      ) : null}
    </div>
  );
}

/** Renders either the current route-compatible actions or the verb-driven action row. */
export function HeaderActions(props: HeaderActionsProps | LegacyHeaderActionsProps): ReactElement {
  if ('verbs' in props) return <VerbHeaderActions {...props} />;
  return <LegacyHeaderActions {...props} />;
}
