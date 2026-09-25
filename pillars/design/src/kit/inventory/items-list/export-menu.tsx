/**
 * Export, from the Items header: this view as CSV (the filters decide the
 * rows), the selection as CSV, or the empty template Import reads. Each
 * entry says how many rows it will write before it writes them.
 */
import { Download, FileSpreadsheet, ListChecks, Rows3 } from 'lucide-react';

import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pops/ui';

import type { LucideIcon } from 'lucide-react';

/** Props for {@link ExportMenu}. */
export interface ExportMenuProps {
  viewCount: number;
  selectedCount: number;
  defaultOpen?: boolean;
}

function Entry({
  icon: Icon,
  title,
  detail,
  disabled = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  disabled?: boolean;
}) {
  return (
    <DropdownMenuItem disabled={disabled} className="items-start gap-3 py-2">
      <Icon className="mt-0.5 size-4 text-muted-foreground" aria-hidden />
      <span className="flex flex-col">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </span>
    </DropdownMenuItem>
  );
}

/** The Export button and its menu. */
export function ExportMenu({ viewCount, selectedCount, defaultOpen }: ExportMenuProps) {
  const rows = (count: number) => (count === 1 ? '1 row' : `${count.toLocaleString('en-AU')} rows`);
  return (
    <DropdownMenuRoot defaultOpen={defaultOpen} modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" prefix={<Download className="size-4" aria-hidden />}>
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <Entry
          icon={Rows3}
          title="This view as CSV"
          detail={`${rows(viewCount)}, as filtered now. Every column, plus each type's fields.`}
        />
        <Entry
          icon={ListChecks}
          title="Selected rows as CSV"
          detail={selectedCount > 0 ? rows(selectedCount) : 'Select rows first.'}
          disabled={selectedCount === 0}
        />
        <DropdownMenuSeparator />
        <Entry
          icon={FileSpreadsheet}
          title="Import template"
          detail="An empty CSV with the columns Import reads."
        />
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
