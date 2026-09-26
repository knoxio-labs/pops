/**
 * The verbs one place takes, as a menu on its tree row and in its panel:
 * open its page, add a place inside, rename, move and delete. Delete is last
 * and set apart, and says whether it will ask first.
 */
import { ArrowUpRight, FolderPlus, MoreHorizontal, SquarePen, Trash2 } from 'lucide-react';

import {
  ButtonPrimitive,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  cn,
} from '@pops/ui';

import { INVENTORY_ICONS, ShortcutHint } from '../foundation';

import type { LucideIcon } from 'lucide-react';

/** What each verb does when chosen. Missing handlers hide their item. */
export interface PlaceMenuHandlers {
  onOpen?: () => void;
  onNewInside?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

function Item({
  icon: Icon,
  label,
  shortcutId,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  shortcutId?: string;
  onSelect?: () => void;
}) {
  if (onSelect === undefined) return null;
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Icon className="size-4" aria-hidden />
      <span className="flex-1">{label}</span>
      {shortcutId ? <ShortcutHint id={shortcutId} /> : null}
    </DropdownMenuItem>
  );
}

/** The menu items, for a trigger of the caller's choosing. */
export function PlaceMenuItems({ handlers }: { handlers: PlaceMenuHandlers }) {
  return (
    <>
      <Item
        icon={ArrowUpRight}
        label="Open page"
        shortcutId="list-open"
        onSelect={handlers.onOpen}
      />
      <Item icon={FolderPlus} label="New place inside" onSelect={handlers.onNewInside} />
      <Item icon={SquarePen} label="Rename" shortcutId="list-edit" onSelect={handlers.onRename} />
      <Item icon={INVENTORY_ICONS.move} label="Move" shortcutId="move" onSelect={handlers.onMove} />
      {handlers.onDelete ? <DropdownMenuSeparator /> : null}
      <Item icon={Trash2} label="Delete" onSelect={handlers.onDelete} />
    </>
  );
}

/** The row's menu button, shown on hover, focus and selection. */
export function PlaceMenu({
  name,
  handlers,
  className,
}: {
  name: string;
  handlers: PlaceMenuHandlers;
  className?: string;
}) {
  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <ButtonPrimitive
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${name}`}
          className={cn('shrink-0 text-muted-foreground', className)}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </ButtonPrimitive>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <PlaceMenuItems handlers={handlers} />
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
