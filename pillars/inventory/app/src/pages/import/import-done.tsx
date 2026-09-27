import { CircleCheck, Download } from 'lucide-react';

import { Button } from '@pops/ui';

import { ListBody } from '../../foundation/items-table/list-body.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { HintTooltip } from '../../foundation/shortcuts/hint-tooltip.js';

import type { ReactElement } from 'react';

/** Props for the completed import view. */
export interface ImportDoneProps {
  imported: number;
  skipped: number;
  /** The name of the imported file. */
  file: string;
  onDownloadSkipped: () => void;
  onShowInItems: () => void;
  onPrintLabels: () => void;
  /** Disables Print labels and explains why when the labels page cap is exceeded. */
  printDisabledReason?: string;
  onUndo: () => void;
}

/** Renders the completed import summary and its follow-up actions. */
export function ImportDone({
  imported,
  skipped,
  file,
  onDownloadSkipped,
  onShowInItems,
  onPrintLabels,
  printDisabledReason,
  onUndo,
}: ImportDoneProps): ReactElement {
  const Label = INVENTORY_ICONS.label;
  const printButton = (
    <Button
      type="button"
      variant="outline"
      prefix={<Label className="size-4" aria-hidden />}
      disabled={printDisabledReason !== undefined}
      onClick={onPrintLabels}
    >
      {`Print ${String(imported)} labels`}
    </Button>
  );

  return (
    <ListBody className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <CircleCheck className="size-10 text-success" aria-hidden />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">{`Imported ${String(imported)} items from ${file}`}</h2>
        <p className="text-sm text-muted-foreground">
          {skipped > 0
            ? `${String(skipped)} rows were skipped. Their file keeps your columns and adds a Problem column; fix it and import it again.`
            : 'Every row was imported.'}
        </p>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {skipped > 0 ? (
          <Button
            type="button"
            onClick={onDownloadSkipped}
            prefix={<Download className="size-4" aria-hidden />}
          >
            {`Download ${String(skipped)} skipped rows`}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onShowInItems}>
          {`Show the ${String(imported)} in Items`}
        </Button>
        <HintTooltip
          label={`Print ${String(imported)} labels`}
          disabledReason={printDisabledReason}
        >
          {printButton}
        </HintTooltip>
        <Button type="button" variant="ghost" onClick={onUndo}>
          Undo import
        </Button>
      </div>
    </ListBody>
  );
}
