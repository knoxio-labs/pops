import { ChevronDown, FileUp, ListPlus, Plus } from 'lucide-react';

import {
  Button,
  ButtonPrimitive,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  cn,
} from '@pops/ui';

import { HintTooltip } from '../shortcuts/hint-tooltip';
import { ShortcutHint } from '../shortcuts/shortcut-hint';

/** Props for {@link NewItemButton}. */
export interface NewItemButtonProps {
  label?: string;
  /** No connection: adding is off, and the tooltip says why. */
  offline?: boolean;
  /** Opens the page each choice leads to. */
  onNavigate?: (path: string) => void;
}

/** New item, with a menu for bulk entry and CSV import. */
export function NewItemButton({
  label = 'New item',
  offline = false,
  onNavigate,
}: NewItemButtonProps) {
  return (
    <span className="flex items-center">
      <HintTooltip
        label={label}
        shortcutId="new-item"
        disabledReason={offline ? 'No connection' : undefined}
      >
        <Button
          type="button"
          aria-disabled={offline || undefined}
          className={cn('rounded-r-none', offline && 'opacity-50')}
          prefix={<Plus className="size-4" aria-hidden />}
          onClick={offline ? undefined : () => onNavigate?.('/inventory/items/new')}
        >
          {label}
        </Button>
      </HintTooltip>
      <DropdownMenuRoot modal={false}>
        <DropdownMenuTrigger asChild>
          <ButtonPrimitive
            type="button"
            size="icon"
            aria-label="More ways to add"
            disabled={offline}
            className="rounded-l-none border-l border-primary-foreground/20"
          >
            <ChevronDown className="size-4" aria-hidden />
          </ButtonPrimitive>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onNavigate?.('/inventory/items/bulk-new')}>
            <ListPlus className="size-4" aria-hidden />
            Bulk entry
            <ShortcutHint id="bulk-entry" className="ml-auto" />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onNavigate?.('/inventory/import')}>
            <FileUp className="size-4" aria-hidden />
            Import CSV
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenuRoot>
    </span>
  );
}
