import { Archive, Save } from 'lucide-react';

import { Button } from '@pops/ui';

import type { CatalogueType } from './types';

interface TypeFormActionsProps {
  readonly isPending: boolean;
  readonly isValid: boolean;
  readonly onArchive?: () => void;
  readonly onRestore?: () => void;
  readonly type?: CatalogueType;
}

/** Renders save and lifecycle actions for a catalogue type. */
export function TypeFormActions({
  isPending,
  isValid,
  onArchive,
  onRestore,
  type,
}: TypeFormActionsProps) {
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
      <div>
        {type !== undefined && type.archivedAt === null && onArchive !== undefined && (
          <Button type="button" variant="outline" onClick={onArchive} disabled={isPending}>
            <Archive className="h-4 w-4" />
            Archive type
          </Button>
        )}
        {type !== undefined && type.archivedAt !== null && onRestore !== undefined && (
          <Button type="button" variant="outline" onClick={onRestore} disabled={isPending}>
            Restore type
          </Button>
        )}
      </div>
      <Button type="submit" disabled={!isValid || isPending}>
        <Save className="h-4 w-4" />
        {type === undefined ? 'Create type' : 'Save type'}
      </Button>
    </div>
  );
}
