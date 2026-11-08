import { Plus } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  ComboboxSelect,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  TextInput,
} from '@pops/ui';

import { useDirectory } from './context';
import { createDirectoryContact, directoryKinds } from './model';

/** Capture only an explicit name and type; no facts are inherited from another contact. */
export function DirectoryCreate() {
  const { state, change } = useDirectory();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="size-4" />
          New contact
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New contact</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            const next = createDirectoryContact(state, { name, kind }, crypto.randomUUID());
            if (next !== state) {
              change(next);
              setOpen(false);
              setName('');
              setKind('');
            }
          }}
        >
          <TextInput
            label="Name"
            autoFocus
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <ContactTypeField kind={kind} setKind={setKind} />
          <footer className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || !directoryKinds.some((item) => item.kind === kind)}
            >
              Create contact
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContactTypeField({ kind, setKind }: { kind: string; setKind: (kind: string) => void }) {
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">Type</p>
      <ComboboxSelect
        aria-label="New contact type"
        value={kind}
        placeholder="Choose type"
        options={directoryKinds.map((item) => ({ value: item.kind, label: item.label }))}
        onChange={(value) => {
          if (typeof value === 'string') setKind(value);
        }}
      />
    </div>
  );
}
