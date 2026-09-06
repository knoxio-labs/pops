import { ENTITY_TYPE_LABEL, type Entity, type EntityType } from '@/fixtures/entities';
import {
  AvatarPreview,
  ColourField,
  ImageField,
  PosterField,
  randomOtherColour,
} from '@/kit/entity-form-fields';
import { useState } from 'react';

import {
  Button,
  ChipInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  Textarea,
  TextInput,
} from '@pops/ui';

const ENTITY_TYPE_OPTIONS = (Object.entries(ENTITY_TYPE_LABEL) as [EntityType, string][]).map(
  ([value, label]) => ({ value, label })
);

interface EntityDraft {
  name: string;
  type: EntityType;
  abn: string;
  aliases: string[];
  notes: string;
  avatar: string | undefined;
  poster: string | undefined;
  colourId: string | undefined;
}

const BLANK_DRAFT: EntityDraft = {
  name: '',
  type: 'company',
  abn: '',
  aliases: [],
  notes: '',
  avatar: undefined,
  poster: undefined,
  colourId: undefined,
};

function entityDraft(entity: Entity | null): EntityDraft {
  if (!entity) return BLANK_DRAFT;
  return {
    name: entity.name,
    type: entity.type,
    abn: entity.abn ?? '',
    aliases: entity.aliases ?? [],
    notes: entity.notes ?? '',
    avatar: entity.avatar,
    poster: entity.poster,
    colourId: entity.colourId,
  };
}

function useEntityFormValues(entity: Entity | null) {
  const initial = entityDraft(entity);
  const [name, setName] = useState(initial.name);
  const [type, setType] = useState<EntityType>(initial.type);
  const [abn, setAbn] = useState(initial.abn);
  const [aliases, setAliases] = useState<string[]>(initial.aliases);
  const [notes, setNotes] = useState(initial.notes);
  const [avatar, setAvatar] = useState(initial.avatar);
  const [poster, setPoster] = useState(initial.poster);
  const [colourId, setColourId] = useState(initial.colourId);
  return {
    name,
    setName,
    type,
    setType,
    abn,
    setAbn,
    aliases,
    setAliases,
    notes,
    setNotes,
    avatar,
    setAvatar,
    poster,
    setPoster,
    colourId,
    setColourId,
  };
}

type FormValues = ReturnType<typeof useEntityFormValues>;

/** Avatar, poster and colour — the identity fields the model gained (POPS-2805). */
function IdentityFields({ values }: { values: FormValues }) {
  return (
    <>
      <ImageField
        label="Avatar"
        image={values.avatar}
        onChange={values.setAvatar}
        preview={
          <AvatarPreview avatar={values.avatar} colourId={values.colourId} name={values.name} />
        }
      />
      <PosterField image={values.poster} onChange={values.setPoster} />
      <ColourField
        colourId={values.colourId}
        onShuffle={() => values.setColourId(randomOtherColour(values.colourId).id)}
      />
    </>
  );
}

/**
 * The plain entity fields. Finance-owned fields (default transaction type,
 * default tags) stay off this form entirely: they belong to finance's own
 * extension of the entity, not to contacts' CRUD.
 */
function DetailFields({ values }: { values: FormValues }) {
  return (
    <>
      <TextInput
        label="Name"
        placeholder="e.g. Woolworths, Netflix"
        value={values.name}
        onChange={(e) => values.setName(e.target.value)}
      />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="Type"
          options={ENTITY_TYPE_OPTIONS}
          value={values.type}
          onChange={(e) => values.setType(e.target.value as EntityType)}
        />
        <TextInput
          label="ABN (optional)"
          placeholder="00 000 000 000"
          value={values.abn}
          onChange={(e) => values.setAbn(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label>Aliases</Label>
        <ChipInput
          placeholder="Type and press Enter…"
          value={values.aliases}
          onChange={values.setAliases}
        />
      </div>
      <div className="space-y-2">
        <Label>Notes (optional)</Label>
        <Textarea
          placeholder="Additional details…"
          value={values.notes}
          onChange={(e) => values.setNotes(e.target.value)}
        />
      </div>
    </>
  );
}

export interface EntityFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null creates a new entity; an Entity edits it. */
  entity: Entity | null;
  onSave?: (values: Partial<Entity>) => void;
}

/**
 * One dialog for both create and edit — the fields are identical, only the
 * title and the starting values differ.
 */
export function EntityFormDialog({ open, onOpenChange, entity, onSave }: EntityFormDialogProps) {
  const values = useEntityFormValues(entity);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave?.({
      name: values.name,
      type: values.type,
      abn: values.abn,
      aliases: values.aliases,
      notes: values.notes,
      avatar: values.avatar,
      poster: values.poster,
      colourId: values.colourId,
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] sm:max-w-125 overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{entity ? 'Edit entity' : 'New entity'}</DialogTitle>
            <DialogDescription className="sr-only">
              Enter the details for this entity
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <IdentityFields values={values} />
            <DetailFields values={values} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit">{entity ? 'Save' : 'Create'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
