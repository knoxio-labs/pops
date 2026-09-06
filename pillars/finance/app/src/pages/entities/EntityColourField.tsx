import { RefreshCw } from 'lucide-react';

import { Button, Label } from '@pops/ui';

export interface EntityColourFieldProps {
  colour: string | null;
  onReroll: () => void;
  isPending: boolean;
}

/**
 * Shows the entity's assigned `colour` with a reroll control — mirrors the
 * design kit's `ColourField`. The colour is never picked from a palette by
 * hand: it is assigned at random when the entity is created
 * (`pillars/contacts/src/entities/colours.rs`), so this field only shows
 * what landed and offers `POST /entities/{id}/colour/reroll`, rather than a
 * swatch grid.
 */
export function EntityColourField({ colour, onReroll, isPending }: EntityColourFieldProps) {
  return (
    <div className="space-y-1.5">
      <Label>Colour</Label>
      <div className="flex items-center gap-3">
        {colour ? (
          <span className="inline-flex items-center gap-2 text-sm">
            <span
              className="size-3.5 rounded-full border border-black/10"
              style={{ backgroundColor: colour }}
            />
            {colour}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">None assigned</span>
        )}
        <Button type="button" variant="outline" size="sm" onClick={onReroll} disabled={isPending}>
          <RefreshCw className="h-3.5 w-3.5" /> Shuffle
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Assigned automatically from a fixed palette — reroll if it clashes.
      </p>
    </div>
  );
}
