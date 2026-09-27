import { ArrowUpRight, FolderPlus, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import {
  ButtonPrimitive,
  DropdownMenu,
  DropdownMenuItem,
  DropdownMenuSeparator,
  cn,
} from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons.js';
import { ShortcutHint } from '../shortcuts/shortcut-hint.js';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** Callbacks for the actions exposed by a place menu. */
export interface PlaceMenuHandlers {
  onOpen?: () => void;
  onNewInside?: () => void;
  onRename?: () => void;
  onMove?: () => void;
  onDelete?: () => void;
}

function MenuItem({
  icon: Icon,
  label,
  shortcutId,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  shortcutId?: string;
  onSelect?: () => void;
}): ReactElement | null {
  if (onSelect === undefined) return null;
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Icon className="size-4" aria-hidden />
      <span className="flex-1">{label}</span>
      {shortcutId ? <ShortcutHint id={shortcutId} /> : null}
    </DropdownMenuItem>
  );
}

function menuItems(handlers: PlaceMenuHandlers, offline: boolean) {
  return [
    handlers.onOpen
      ? {
          label: 'Open page',
          value: 'open',
          icon: <ArrowUpRight className="size-4" aria-hidden />,
          onSelect: handlers.onOpen,
        }
      : null,
    offline || handlers.onNewInside === undefined
      ? null
      : {
          label: 'New place inside',
          value: 'new-inside',
          icon: <FolderPlus className="size-4" aria-hidden />,
          onSelect: handlers.onNewInside,
        },
    offline || handlers.onRename === undefined
      ? null
      : {
          label: 'Rename',
          value: 'rename',
          icon: <Pencil className="size-4" aria-hidden />,
          onSelect: handlers.onRename,
        },
    offline || handlers.onMove === undefined
      ? null
      : {
          label: 'Move',
          value: 'move',
          icon: <INVENTORY_ICONS.move className="size-4" aria-hidden />,
          onSelect: handlers.onMove,
        },
    offline || handlers.onDelete === undefined
      ? null
      : {
          label: 'Delete',
          value: 'delete',
          variant: 'destructive' as const,
          icon: <Trash2 className="size-4" aria-hidden />,
          onSelect: handlers.onDelete,
        },
  ].filter((item): item is NonNullable<typeof item> => item !== null);
}

/** Renders the action menu for one place, hiding edits while offline. */
export function PlaceMenu({
  name,
  handlers,
  offline = false,
  className,
}: {
  name: string;
  handlers: PlaceMenuHandlers;
  offline?: boolean;
  className?: string;
}): ReactElement {
  return (
    <DropdownMenu
      trigger={
        <ButtonPrimitive
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${name}`}
          className={cn('shrink-0 text-muted-foreground', className)}
        >
          <MoreHorizontal className="size-4" aria-hidden />
        </ButtonPrimitive>
      }
      items={menuItems(handlers, offline)}
    />
  );
}

/** Renders the menu's items for callers that own the dropdown trigger. */
export function PlaceMenuItems({ handlers }: { handlers: PlaceMenuHandlers }): ReactElement {
  return (
    <>
      <MenuItem
        icon={ArrowUpRight}
        label="Open page"
        shortcutId="list-open"
        onSelect={handlers.onOpen}
      />
      <MenuItem icon={FolderPlus} label="New place inside" onSelect={handlers.onNewInside} />
      <MenuItem icon={Pencil} label="Rename" shortcutId="list-edit" onSelect={handlers.onRename} />
      <MenuItem
        icon={INVENTORY_ICONS.move}
        label="Move"
        shortcutId="move"
        onSelect={handlers.onMove}
      />
      {handlers.onDelete ? <DropdownMenuSeparator /> : null}
      <MenuItem icon={Trash2} label="Delete" onSelect={handlers.onDelete} />
    </>
  );
}
