import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Puzzle, Unlink } from 'lucide-react';
import { Link } from 'react-router';
import { toast } from 'sonner';

import { AssetIdBadge, toastError } from '@pops/ui';

import { AddPartDialog } from '../../components/AddPartDialog';
import { EmptyLine, PaneLabel } from '../../foundation/item-page/section-parts';
import { VerbButton } from '../../foundation/item-page/verb-button';
import { RowVerb } from '../../foundation/rows/item-row';
import { unwrap } from '../../inventory-api-helpers.js';
import { itemsAddPart, itemsGetParts, itemsRemovePart } from '../../inventory-api/index.js';
import { partError, partsDisabledReasons, partsQueryKey, partWhere } from './parts-model';

import type { ReactElement } from 'react';

import type { ItemParts } from '../../inventory-api/index.js';

type Part = ItemParts['parts'][number];

function usePartMutations(itemId: string) {
  const queryClient = useQueryClient();
  const refresh = (partItemId: string) => {
    void queryClient.invalidateQueries({ queryKey: partsQueryKey(itemId) });
    void queryClient.invalidateQueries({ queryKey: partsQueryKey(partItemId) });
  };
  const add = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (partItemId: string) =>
      unwrap(await itemsAddPart({ path: { itemId }, body: { partItemId } })),
    onSuccess: (_data, partItemId) => {
      toast.success('Part added');
      refresh(partItemId);
    },
    onError: (error: Error) => toastError(partError(error, 'Failed to add the part')),
  });
  const remove = useMutation({
    meta: { errorHandled: true },
    mutationFn: async (partItemId: string) =>
      unwrap(await itemsRemovePart({ path: { itemId, partItemId } })),
    onSuccess: (_data, partItemId) => {
      toast.success('Part removed');
      refresh(partItemId);
    },
    onError: (error: Error) => toastError(partError(error, 'Failed to remove the part')),
  });
  return { add, remove };
}

function PartRow({
  part,
  disabledReason,
  onRemove,
}: {
  part: Part;
  disabledReason: string | undefined;
  onRemove: () => void;
}): ReactElement {
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-border/60 px-2 py-1.5 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <Link
            to={`/inventory/items/${part.itemId}`}
            className="min-w-0 truncate text-sm font-medium hover:underline"
          >
            {part.name}
          </Link>
          {part.code === null ? null : <AssetIdBadge assetId={part.code} />}
        </span>
        <span className="truncate text-xs text-muted-foreground">{partWhere(part.placement)}</span>
      </span>
      <RowVerb
        icon={Unlink}
        label={`Remove ${part.name} from parts`}
        disabledReason={disabledReason}
        onClick={onRemove}
      />
    </li>
  );
}

function AssemblyLine({
  assembly,
}: {
  assembly: NonNullable<ItemParts['assembly']>;
}): ReactElement {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Puzzle className="size-4 shrink-0" aria-hidden />
      <span>
        Part of{' '}
        <Link
          to={`/inventory/items/${assembly.itemId}`}
          className="font-medium text-foreground hover:underline"
        >
          {assembly.name}
        </Link>
      </span>
    </p>
  );
}

function PartsList({
  view,
  addAction,
  disabledReason,
  onRemove,
}: {
  view: ItemParts;
  addAction: ReactElement;
  disabledReason: string | undefined;
  onRemove: (partItemId: string) => void;
}): ReactElement | null {
  if (view.parts.length === 0) {
    return view.canHaveParts ? (
      <EmptyLine icon={Puzzle} text="No parts listed yet." action={addAction} />
    ) : null;
  }
  return (
    <ul aria-label="Parts" className="divide-y divide-border/60">
      {view.parts.map((part) => (
        <PartRow
          key={part.itemId}
          part={part}
          disabledReason={disabledReason}
          onRemove={() => onRemove(part.itemId)}
        />
      ))}
    </ul>
  );
}

/**
 * The assembly an item is a part of, and its own parts with where each one is.
 * Renders nothing for an item that is neither an assembly nor a part.
 */
export function PartsSection({
  itemId,
  readOnly,
}: {
  itemId: string;
  readOnly: boolean;
}): ReactElement | null {
  const query = useQuery({
    queryKey: partsQueryKey(itemId),
    queryFn: async () => unwrap(await itemsGetParts({ path: { itemId } })).data,
  });
  const { add, remove } = usePartMutations(itemId);
  const view = query.data;
  if (view === undefined) return null;
  const isAssembly = view.canHaveParts || view.parts.length > 0;
  if (!isAssembly && view.assembly === null) return null;

  const { disabledReason, addDisabledReason } = partsDisabledReasons(
    view,
    readOnly,
    add.isPending || remove.isPending
  );
  const addAction = (
    <AddPartDialog
      assemblyItemId={itemId}
      isAdding={add.isPending}
      onPick={(partItemId) => add.mutate(partItemId)}
      trigger={
        <VerbButton
          label="Add part"
          icon={Puzzle}
          disabledReason={addDisabledReason}
          variant="outline"
        />
      }
    />
  );

  return (
    <section aria-label="Parts" className="flex flex-col gap-3">
      {isAssembly ? (
        <PaneLabel trailing={addAction}>Parts</PaneLabel>
      ) : (
        <PaneLabel>Parts</PaneLabel>
      )}
      {view.assembly === null ? null : <AssemblyLine assembly={view.assembly} />}
      {isAssembly ? (
        <PartsList
          view={view}
          addAction={addAction}
          disabledReason={disabledReason}
          onRemove={(partItemId) => remove.mutate(partItemId)}
        />
      ) : null}
    </section>
  );
}
