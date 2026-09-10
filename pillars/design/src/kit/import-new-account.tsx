import { Plus } from 'lucide-react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
} from '@pops/ui';

/** The way to add a bank POPS has never seen without leaving the import. */
export function AddAccountHatch() {
  return (
    <p className="text-xs text-muted-foreground">
      Importing a bank POPS has never seen?{' '}
      <Button variant="link" className="h-auto p-0 text-xs" prefix={<Plus className="h-3 w-3" />}>
        Add the account
      </Button>{' '}
      and you come straight back here with it selected, and the file you already have stays chosen.
    </p>
  );
}

export function NewAccountDialog() {
  return (
    <Dialog defaultOpen>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New account</DialogTitle>
          <DialogDescription>
            The same fields as the account form, opened over the import rather than instead of it.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="new-account-name">Name</Label>
          <Input id="new-account-name" defaultValue="Bendigo Everyday" />
          <p className="text-xs text-muted-foreground">
            Kind, institution and currency follow, then this closes back onto the import.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline">Cancel</Button>
          <Button>Create and continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
