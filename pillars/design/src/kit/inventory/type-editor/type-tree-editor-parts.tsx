import { inventoryCatalogueTypes } from '@/fixtures/inventory-type-catalogue';
import { CatalogueList } from '@/kit/inventory/type-editor/catalogue-list';
import { parentChoices, typeHeight } from '@/kit/inventory/type-tree/model';
import { TypeTreePicker } from '@/kit/inventory/type-tree/type-tree-picker';
import { Archive } from 'lucide-react';

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  Input,
  Label,
  Textarea,
  cn,
} from '@pops/ui';

import type { ReactNode } from 'react';

const typeById = new Map(inventoryCatalogueTypes.map((type) => [type.id, type]));

function TypeStatus({ typeId }: { typeId: string }) {
  const type = typeById.get(typeId);
  if (type === undefined) return null;
  return (
    <Badge
      variant="outline"
      className={cn(
        'capitalize',
        type.status === 'draft' && 'border-primary/30 bg-primary/10 text-primary',
        type.status === 'archived' && 'opacity-70 line-through'
      )}
    >
      {type.status}
    </Badge>
  );
}

/** Shared title and status block for type-tree editor cards. */
export function EditorTitle({ typeId, title }: { typeId: string; title?: string }) {
  const type = typeById.get(typeId);
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{title ?? type?.label}</h2>
          <TypeStatus typeId={typeId} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {type?.itemCount ?? 0} items · {type?.description}
        </p>
      </div>
      <Button variant="outline" size="sm">
        <Archive className="size-4" aria-hidden />
        Archive
      </Button>
    </div>
  );
}

/** Permanent catalogue navigation beside every type-tree editor state. */
export function TypeTreeShell({
  children,
  selectedId,
  searchQuery,
}: {
  children: ReactNode;
  selectedId: string;
  searchQuery?: string;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)] lg:items-start">
      <CatalogueList
        types={inventoryCatalogueTypes}
        selectedId={selectedId}
        searchQuery={searchQuery}
        showArchived
      />
      {children}
    </div>
  );
}

/** A refusal shown inline in a type-tree editor state. */
export function Refusal({
  title,
  children,
  code,
}: {
  title: string;
  children: ReactNode;
  code?: string;
}) {
  return (
    <Alert variant="destructive">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>
        {children}
        {code === undefined ? null : <p className="mt-2 font-mono text-xs">{code}</p>}
      </AlertDescription>
    </Alert>
  );
}

/** Parent choices with the depth-cap and cycle refusals visible. */
export function ParentChoiceList() {
  const choices = parentChoices(inventoryCatalogueTypes, 'type-pillows');
  const reasons = new Map(
    choices.flatMap((choice) =>
      choice.reason === undefined ? [] : [[choice.value, choice.reason] as const]
    )
  );
  return (
    <div className="space-y-3">
      <TypeTreePicker
        types={inventoryCatalogueTypes}
        value={null}
        open
        label="Parent"
        placeholder="Choose a parent"
        reasons={reasons}
      />
      <p className="text-xs text-muted-foreground">
        Pillows has height {typeHeight(inventoryCatalogueTypes, 'type-pillows')}. A parent must
        leave room for every descendant.
      </p>
    </div>
  );
}

/** Create-subtype form with its inherited capability preview. */
export function CreateSubtype() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-pillowcase" title="New subtype" />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="subtype-label">Type label</Label>
            <Input id="subtype-label" defaultValue="Pillowcase" className="min-h-11" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="subtype-key">Key</Label>
            <Input id="subtype-key" defaultValue="pillowcase" className="min-h-11 font-mono" />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="subtype-description">Description</Label>
            <Textarea id="subtype-description" defaultValue="Removable pillow covers." />
          </div>
        </div>
        <TypeTreePicker types={inventoryCatalogueTypes} value="type-pillows" label="Parent" />
        <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
          <p className="font-medium">This subtype inherits from Pillows & cushions and Pillows</p>
          <p className="mt-1 text-muted-foreground">
            4 fields and the destination capability will be available on Pillowcase.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button variant="outline">Cancel</Button>
          <Button>Create subtype</Button>
        </div>
      </CardContent>
    </Card>
  );
}
