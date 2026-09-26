/**
 * The end of an import: how many items arrived, how many rows were skipped
 * and why they come back as a file, and where to go next.
 */
import { CircleCheck, Download } from 'lucide-react';

import { Button } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';
import { ListBody } from '../items-list/list-page';

/** The done step. */
export function ImportDone({
  imported,
  skipped,
  file,
}: {
  imported: number;
  skipped: number;
  file: string;
}) {
  const Label = INVENTORY_ICONS.label;
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
            prefix={<Download className="size-4" aria-hidden />}
          >{`Download ${String(skipped)} skipped rows`}</Button>
        ) : null}
        <Button variant="outline">Show the {imported} in Items</Button>
        <Button variant="outline" prefix={<Label className="size-4" aria-hidden />}>
          Print {imported} labels
        </Button>
        <Button variant="ghost">Undo import</Button>
      </div>
    </ListBody>
  );
}
