import { Pencil, QrCode, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
} from '@pops/ui';

import { labelsHref } from '../labels-page/label-params';

function pluralize(value: number, singular: string): string {
  return value === 1 ? singular : `${singular}s`;
}

function PrintLabelButton({ id }: { id: string }) {
  return (
    <Button asChild variant="outline" size="sm" className="font-bold">
      <Link to={labelsHref([id])}>
        <QrCode className="mr-2 size-4 text-app-accent" aria-hidden />
        Print label
      </Link>
    </Button>
  );
}

function EditButton({ id, readOnly }: { id: string; readOnly: boolean }) {
  const disabledReason = 'Nothing can change on this item.';
  if (readOnly) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled
        title={disabledReason}
        aria-label={`Edit (${disabledReason})`}
      >
        <Pencil className="mr-2 size-4" aria-hidden />
        Edit
      </Button>
    );
  }
  return (
    <Button asChild variant="outline" size="sm" className="font-bold">
      <Link to={`/inventory/items/${id}/edit`}>
        <Pencil className="mr-2 size-4 text-app-accent" aria-hidden />
        Edit
      </Link>
    </Button>
  );
}

function DeleteButton({
  itemName,
  connectionsCount,
  photosCount,
  readOnly,
  onDelete,
}: {
  itemName: string;
  connectionsCount: number;
  photosCount: number;
  readOnly: boolean;
  onDelete: () => void;
}) {
  const disabledReason = 'Nothing can change on this item.';
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="text-destructive"
          disabled={readOnly}
          title={readOnly ? disabledReason : undefined}
        >
          <Trash2 className="mr-2 size-4" aria-hidden />
          Delete
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {itemName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will also remove {connectionsCount} {pluralize(connectionsCount, 'connection')} and{' '}
            {photosCount} {pluralize(photosCount, 'photo')}.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Header actions retained by the route-compatible item page. */
export function HeaderActions({
  id,
  itemName,
  connectionsCount,
  photosCount,
  readOnly,
  onDelete,
}: {
  id: string;
  itemName: string;
  connectionsCount: number;
  photosCount: number;
  readOnly: boolean;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <PrintLabelButton id={id} />
      <EditButton id={id} readOnly={readOnly} />
      <DeleteButton
        itemName={itemName}
        connectionsCount={connectionsCount}
        photosCount={photosCount}
        readOnly={readOnly}
        onDelete={onDelete}
      />
    </div>
  );
}
