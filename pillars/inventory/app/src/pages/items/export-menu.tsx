import { Download } from 'lucide-react';

import {
  Button,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pops/ui';

import type { ReactElement } from 'react';

function rowCount(count: number): string {
  return `${count.toLocaleString('en-AU')} ${count === 1 ? 'row' : 'rows'}`;
}

function MenuCopy({ label, detail }: { label: string; detail: string }): ReactElement {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <span>{label}</span>
      <span className="text-xs font-normal text-muted-foreground">{detail}</span>
    </span>
  );
}

/** Props for the Items export menu. */
export interface ExportMenuProps {
  /** Rows matched by the current filters, or null before the list answers. */
  readonly viewCount: number | null;
  readonly selectedCount: number;
  readonly busy: boolean;
  readonly onView: () => void;
  readonly onSelection: () => void;
  readonly onTemplate: () => void;
}

/** Renders the Items CSV export menu and its count-aware disabled states. */
export function ExportMenu({
  viewCount,
  selectedCount,
  busy,
  onView,
  onSelection,
  onTemplate,
}: ExportMenuProps): ReactElement {
  const viewDisabled = viewCount === null || busy;
  const selectionDisabled = selectedCount === 0 || busy;

  return (
    <DropdownMenuRoot modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          prefix={<Download className="size-4" aria-hidden />}
        >
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuItem disabled={viewDisabled} onSelect={onView}>
          <MenuCopy
            label="This view as CSV"
            detail={`${rowCount(viewCount ?? 0)}, as filtered now. Every column, plus each type's fields.`}
          />
        </DropdownMenuItem>
        <DropdownMenuItem disabled={selectionDisabled} onSelect={onSelection}>
          <MenuCopy
            label="Selected rows as CSV"
            detail={selectedCount === 0 ? 'Select rows first.' : rowCount(selectedCount)}
          />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={busy} onSelect={onTemplate}>
          <MenuCopy label="Import template" detail="An empty CSV with the columns Import reads." />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}
