/**
 * The New tab: type a name, press Enter, and the item is created straight
 * into the target; the field clears for the next one. Anything more than a
 * name belongs to the full form, one link away with the target filled in.
 */
import { CornerDownLeft, SquarePen } from 'lucide-react';

import { Button, Input } from '@pops/ui';

import { INVENTORY_ICONS } from '../shared/icons';

/** Props for {@link NewTab}. */
export interface NewTabProps {
  targetName: string;
  name: string;
  onName: (name: string) => void;
  onCreate: () => void;
  created: readonly string[];
  disabled: boolean;
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

/** The tab body. */
export function NewTab({ targetName, name, onName, onCreate, created, disabled }: NewTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <Input
            value={name}
            autoFocus
            disabled={disabled}
            aria-label={`Name of the new item in ${targetName}`}
            placeholder="Name, then Enter"
            onChange={(event) => onName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter' || name.trim() === '') return;
              event.preventDefault();
              onCreate();
            }}
            className="h-9"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || name.trim() === ''}
            onClick={onCreate}
            suffix={<CornerDownLeft className="size-3.5" aria-hidden />}
          >
            Create
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Creates an untyped item in {targetName}. Type, code and fields can be added later.
        </p>
      </div>
      {created.length > 0 ? <CreatedList created={created} targetName={targetName} /> : null}
      <Button
        variant="ghost"
        size="sm"
        prefix={<SquarePen className="size-3.5" aria-hidden />}
        className="self-start text-muted-foreground"
      >
        Open the full form for {targetName}
      </Button>
    </div>
  );
}
