import { Archive, Save } from 'lucide-react';

import { Button } from '@pops/ui';

import type { CatalogueField } from './types';

interface FieldFormActionsProps {
  readonly field?: CatalogueField;
  readonly isPending: boolean;
  readonly isValid: boolean;
  readonly onArchive?: () => void;
  readonly onRestore?: () => void;
}

/** Renders save and lifecycle actions for a catalogue field. */
export function FieldFormActions({
  field,
  isPending,
  isValid,
  onArchive,
  onRestore,
}: FieldFormActionsProps) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
      <div>
        {field !== undefined && field.archivedAt === null && onArchive !== undefined && (
          <Button type="button" variant="outline" onClick={onArchive} disabled={isPending}>
            <Archive className="h-4 w-4" /> Archive field
          </Button>
        )}
        {field !== undefined && field.archivedAt !== null && onRestore !== undefined && (
          <Button type="button" variant="outline" onClick={onRestore} disabled={isPending}>
            Restore field
          </Button>
        )}
      </div>
      <Button type="submit" disabled={!isValid || isPending}>
        <Save className="h-4 w-4" /> {field === undefined ? 'Create field' : 'Save field'}
      </Button>
    </div>
  );
}
