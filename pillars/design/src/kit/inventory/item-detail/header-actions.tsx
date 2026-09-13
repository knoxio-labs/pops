import { Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';

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

interface HeaderActionsProps {
  id: string;
  itemName: string;
  connectionsCount: number;
  photosCount: number;
  onDelete: () => void;
  /** Called with the edit route's path instead of navigating there directly. */
  onNavigate?: (path: string) => void;
  /** Forces the delete confirmation open on mount, for the design canvas's states map. */
  initialDeleteConfirmOpen?: boolean;
}

function pluralize(n: number, singular: string, plural?: string): string {
  return n !== 1 ? (plural ?? `${singular}s`) : singular;
}

export function HeaderActions({
  id,
  itemName,
  connectionsCount,
  photosCount,
  onDelete,
  onNavigate = () => {},
  initialDeleteConfirmOpen = false,
}: HeaderActionsProps) {
  const [deleteOpen, setDeleteOpen] = useState(initialDeleteConfirmOpen);

  return (
    <div className="flex items-center gap-2">
      <Button
        asChild
        variant="outline"
        size="sm"
        className="font-bold border-app-accent/20 hover:border-app-accent/50 hover:bg-app-accent/5 transition-colors"
      >
        <a
          href={`/inventory/items/${id}/edit`}
          onClick={(e) => {
            e.preventDefault();
            onNavigate(`/inventory/items/${id}/edit`);
          }}
        >
          <Pencil className="h-4 w-4 mr-2 text-app-accent" />
          Edit
        </a>
      </Button>
      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogTrigger asChild>
          <Button variant="ghost" size="sm" className="text-destructive">
            <Trash2 className="h-4 w-4 mr-2" />
            Delete
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {itemName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will also remove {connectionsCount} {pluralize(connectionsCount, 'connection')}{' '}
              and {photosCount} {pluralize(photosCount, 'photo')}.
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
    </div>
  );
}
