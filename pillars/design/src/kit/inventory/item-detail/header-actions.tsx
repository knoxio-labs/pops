/**
 * The header's verbs: the one that fits where the item is, the container
 * verbs, Edit and More. Move opens the placement picker in place; nothing
 * here navigates away.
 */
import { PlacementPicker } from '../foundation';
import { MoreMenu } from './more-menu';
import { VerbButton } from './verb-button';

import type { ReactElement } from 'react';

import type { PlacementTarget, PlacementWorld } from '../foundation';
import type { DetailVerb, DetailVerbs, MenuEntry } from './detail-verbs';

/** Props for {@link HeaderActions}. */
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
}

function Verb({
  verb,
  primary,
  props,
}: {
  verb: DetailVerb;
  primary: boolean;
  props: HeaderActionsProps;
}) {
  const button = (
    <VerbButton
      label={verb.label}
      icon={verb.icon}
      shortcutId={verb.shortcutId}
      detail={verb.detail}
      disabledReason={verb.disabledReason}
      variant={primary ? 'default' : 'outline'}
      onClick={() => props.onVerb?.(verb)}
    />
  );
  if (verb.id !== 'move' || verb.disabledReason !== undefined) return button;
  return <MoveVerb button={button} props={props} />;
}

function MoveVerb({ button, props }: { button: ReactElement; props: HeaderActionsProps }) {
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
    />
  );
}

/** The header's action row. */
export function HeaderActions(props: HeaderActionsProps) {
  const { verbs } = props;
  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
      {verbs.primary ? <Verb verb={verbs.primary} primary props={props} /> : null}
      {verbs.secondary.map((verb) => (
        <Verb key={verb.id} verb={verb} primary={false} props={props} />
      ))}
      {verbs.edit ? <Verb verb={verbs.edit} primary={false} props={props} /> : null}
      {verbs.menu.length > 0 ? (
        <MoreMenu groups={verbs.menu} defaultOpen={props.menuOpen} onSelect={props.onMenu} />
      ) : null}
    </div>
  );
}
