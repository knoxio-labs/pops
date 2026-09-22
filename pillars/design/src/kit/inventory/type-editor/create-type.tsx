import { AlertCircle, Check, Plus, Save } from 'lucide-react';

import { Button, Input, Label, Switch, Textarea, cn } from '@pops/ui';

function KeyAvailability({ collision }: { collision: boolean }) {
  if (collision) {
    return (
      <p className="flex items-start gap-1.5 text-xs text-destructive">
        <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        This key belongs to archived type “Music gear”. Choose a unique key; published keys are
        never reused.
      </p>
    );
  }
  return (
    <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
      Available · generated from the label. You can override it until first publication.
    </p>
  );
}

function TypeIdentity({ keyCollision }: { keyCollision: boolean }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="font-semibold">Type details</h3>
        <p className="text-sm text-muted-foreground">
          Give the type an owner-facing name and stable automation key.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="type-label">Type label</Label>
          <Input id="type-label" defaultValue="Musical instruments" className="min-h-11" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="type-key">Key</Label>
          <Input
            id="type-key"
            defaultValue={keyCollision ? 'music_gear' : 'musical_instruments'}
            className={cn('min-h-11 font-mono', keyCollision && 'border-destructive')}
          />
          <KeyAvailability collision={keyCollision} />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="type-description">Description</Label>
          <Textarea
            id="type-description"
            defaultValue="Instruments, cases and performance accessories."
          />
        </div>
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3 sm:col-span-2">
          <div>
            <Label htmlFor="containment" className="text-sm font-medium">
              Containment capability
            </Label>
            <p className="mt-1 text-xs text-muted-foreground">
              Items of this type can contain other items. Changing this after publication requires a
              migration.
            </p>
          </div>
          <Switch id="containment" />
        </div>
      </div>
    </section>
  );
}

function FirstFieldPrompt({ blocked }: { blocked: boolean }) {
  return (
    <section className="space-y-3 border-t pt-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold">Fields</h3>
          <p className="text-sm text-muted-foreground">
            Start the draft, then define its first field in the same editor.
          </p>
        </div>
        <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">
          0 fields
        </span>
      </div>
      <div className="flex flex-col items-center rounded-lg border border-dashed p-6 text-center">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Plus className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="mt-3 text-sm font-medium">Add the first field</p>
        <p className="mt-1 max-w-md text-sm text-muted-foreground">
          This creates the type draft and opens a blank field inspector. Nothing can publish until
          the field validates.
        </p>
        <Button className="mt-4" disabled={blocked}>
          <Save className="h-4 w-4" />
          Create draft & add field
        </Button>
      </div>
    </section>
  );
}

/** New-type identity, generated-key validation and first-field entry point. */
export function CreateType({ keyCollision = false }: { keyCollision?: boolean }) {
  return (
    <div className="space-y-6">
      <TypeIdentity keyCollision={keyCollision} />
      <FirstFieldPrompt blocked={keyCollision} />
    </div>
  );
}
