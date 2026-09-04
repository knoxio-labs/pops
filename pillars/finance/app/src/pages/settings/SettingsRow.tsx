import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { Button, DropdownMenu, DropdownMenuItem, DropdownMenuSeparator } from '@pops/ui';

import type { ReactNode } from 'react';

interface SettingsRowProps {
  leading: ReactNode;
  title: string;
  subtitle: ReactNode;
  onEdit: () => void;
  onDelete: () => void;
}

/** One row in a settings list: a leading mark, a title/subtitle pair, and an actions menu. */
export function SettingsRow({ leading, title, subtitle, onEdit, onDelete }: SettingsRowProps) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-3">
      {leading}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <DropdownMenu
        trigger={
          <Button variant="ghost" size="icon" aria-label={`Actions for ${title}`}>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        }
        align="end"
      >
        <DropdownMenuItem onClick={onEdit}>
          <Pencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenu>
    </div>
  );
}
