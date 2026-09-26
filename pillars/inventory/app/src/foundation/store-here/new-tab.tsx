/**
 * The New tab: type a name, press Enter, and create the item directly in the
 * target. Anything beyond a name belongs to the full form.
 */
import { CornerDownLeft, SquarePen } from 'lucide-react';

import { Button, Input } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';

/** Props for {@link NewTab}. */
export interface NewTabProps {
  targetName: string;
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  created: readonly string[];
  /** Disables the field and Create when the target cannot accept a store. */
  disabled: boolean;
  /** Disables Create and Enter while the owner is loading or submitting. */
  createDisabled: boolean;
  /** Opens the full item form with the target already selected. */
  onOpenForm: () => void;
  /** A field-level problem returned by the owner. */
  error: string | null;
}

function CreatedList({ created, targetName }: { created: readonly string[]; targetName: string }) {
  const Item = INVENTORY_ICONS.item;
  return (
    <section aria-labelledby="store-created" className="min-h-0 space-y-1.5">
      <h3 id="store-created" className="text-xs font-medium text-muted-foreground">
        Created in {targetName} just now
      </h3>
      <ul className="divide-y divide-border/60 rounded-md border">
        {created.map((name) => (
          <li key={name} className="flex h-10 items-center gap-2.5 px-3 text-sm">
            <Item className="size-4 text-muted-foreground" aria-hidden />
            <span className="truncate">{name}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function NewItemEntry({
  targetName,
  name,
  onName,
  onCreate,
  disabled,
  createDisabled,
  error,
}: Pick<
  NewTabProps,
  'targetName' | 'name' | 'onName' | 'onCreate' | 'disabled' | 'createDisabled' | 'error'
>) {
  const canCreate = !disabled && !createDisabled && name.trim() !== '';
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <Input
          value={name}
          autoFocus
          disabled={disabled}
          aria-label={`Name of the new item in ${targetName}`}
          aria-invalid={error !== null}
          aria-describedby={error === null ? undefined : 'store-new-item-error'}
          placeholder="Name, then Enter"
          onChange={(event) => onName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || !canCreate) return;
            event.preventDefault();
            onCreate();
          }}
          className="h-9"
        />
        <Button
          size="sm"
          variant="outline"
          disabled={!canCreate}
          onClick={onCreate}
          suffix={<CornerDownLeft className="size-3.5" aria-hidden />}
        >
          Create
        </Button>
      </div>
      {error ? (
        <p id="store-new-item-error" className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Creates an untyped item in {targetName}. Type, code and fields can be added later.
      </p>
    </div>
  );
}

/** The New tab body. */
export function NewTab({
  targetName,
  name,
  onName,
  onCreate,
  created,
  disabled,
  createDisabled,
  onOpenForm,
  error,
}: NewTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <NewItemEntry
        targetName={targetName}
        name={name}
        onName={onName}
        onCreate={onCreate}
        disabled={disabled}
        createDisabled={createDisabled}
        error={error}
      />
      {created.length > 0 ? <CreatedList created={created} targetName={targetName} /> : null}
      <Button
        variant="ghost"
        size="sm"
        prefix={<SquarePen className="size-3.5" aria-hidden />}
        className="self-start text-muted-foreground"
        onClick={onOpenForm}
      >
        Open the full form for {targetName}
      </Button>
    </div>
  );
}
