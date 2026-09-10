import { institutions as seedInstitutions, type Institution } from '@/fixtures/institutions';
import { useState } from 'react';

import {
  Button,
  ColourInput,
  CRUDManagementSection,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  isValidHexColour,
  TextInput,
} from '@pops/ui';

import { InstitutionMark } from './institution-select';
import { SettingsDeleteDialog } from './settings-delete-dialog';
import { SettingsRow } from './settings-row';

function InstitutionEditDialog({
  institution,
  onCancel,
  onSave,
}: {
  institution: Institution;
  onCancel: () => void;
  onSave: (next: Institution) => void;
}) {
  const [name, setName] = useState(institution.name);
  const [colour, setColour] = useState(institution.colour);
  const valid = name.trim().length > 0 && isValidHexColour(colour);

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-(--size-dialog-sm)">
        <DialogHeader>
          <DialogTitle>Edit institution</DialogTitle>
          <DialogDescription className="sr-only">
            Rename this institution or change its colour
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <TextInput label="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <ColourInput label="Colour" value={colour} onChange={setColour} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!valid} onClick={() => onSave({ ...institution, name, colour })}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Institutions list as a settings section (POPS-2843): a `CRUDManagementSection`
 * shell with one row per institution, replacing the plain `DataTable` PR #4372
 * shipped when no design spec existed yet. Creation stays out of scope
 * (POPS-2810): institutions are minted inline from the account form.
 */
export function InstitutionsSection({ initial }: { initial?: Institution[] }) {
  const [items, setItems] = useState<Institution[]>(initial ?? seedInstitutions);
  const [editing, setEditing] = useState<Institution | null>(null);
  const [deleting, setDeleting] = useState<Institution | null>(null);

  return (
    <CRUDManagementSection title="Institutions" description="Where accounts are held">
      {items.length === 0 && <p className="text-sm text-muted-foreground">No institutions yet.</p>}
      {items.map((institution) => (
        <SettingsRow
          key={institution.id}
          leading={<InstitutionMark institution={institution} />}
          title={institution.name}
          subtitle={institution.colour}
          onEdit={() => setEditing(institution)}
          onDelete={() => setDeleting(institution)}
        />
      ))}
      {editing && (
        <InstitutionEditDialog
          institution={editing}
          onCancel={() => setEditing(null)}
          onSave={(next) => {
            setItems((list) => list.map((i) => (i.id === next.id ? next : i)));
            setEditing(null);
          }}
        />
      )}
      <SettingsDeleteDialog
        open={!!deleting}
        itemLabel={deleting?.name ?? ''}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          if (!deleting) return;
          setItems((list) => list.filter((i) => i.id !== deleting.id));
          setDeleting(null);
        }}
      />
    </CRUDManagementSection>
  );
}
