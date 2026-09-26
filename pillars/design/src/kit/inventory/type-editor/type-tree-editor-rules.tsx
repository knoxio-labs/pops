import { inventoryCatalogueTypes } from '@/fixtures/inventory-type-catalogue';
import { TypeTreePicker } from '@/kit/inventory/type-tree/type-tree-picker';
import { Check, GitBranch, LockKeyhole, Trash2 } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardHeader, Input, Label } from '@pops/ui';

import { EditorTitle, Refusal } from './type-tree-editor-parts';

function DepthCap() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-pillows" />
      </CardHeader>
      <CardContent className="space-y-5">
        <TypeTreePicker types={inventoryCatalogueTypes} value="type-sheet" label="New parent" />
        <Refusal title="Cannot use Bedding › Sheet as the parent">
          Pillowcase would be at depth 4. The catalogue depth cap is 3, so this change would make
          the type tree invalid.
        </Refusal>
      </CardContent>
    </Card>
  );
}

function KeyShadowed() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-sheet" />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label htmlFor="shadowed-key">Field key</Label>
          <Input id="shadowed-key" defaultValue="material" className="min-h-11 font-mono" />
        </div>
        <Refusal title="Field key is shadowed by an ancestor">
          Material already belongs to Bedding. Adding another Material to Sheet would create two
          meanings for the same inherited field id.
        </Refusal>
        <Button disabled>
          <Check className="size-4" aria-hidden />
          Add field
        </Button>
      </CardContent>
    </Card>
  );
}

function ArchiveWithChildren() {
  const children = inventoryCatalogueTypes.filter(
    (type) => type.parentTypeId === 'type-pillows' && type.status !== 'archived'
  );
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-pillows" />
      </CardHeader>
      <CardContent className="space-y-5">
        <Refusal title="Cannot archive Pillows while it has live children">
          Move or archive the live children first. The archived Pillow protector does not block this
          action.
        </Refusal>
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Live children</h3>
          {children.map((child) => (
            <div key={child.id} className="flex min-h-11 items-center gap-3 rounded-md border px-3">
              <span className="min-w-0 flex-1 text-sm">{child.label}</span>
              <Badge variant="outline">{child.itemCount} items</Badge>
            </div>
          ))}
        </div>
        <Button variant="destructive" disabled>
          <Trash2 className="size-4" aria-hidden />
          Archive Pillows
        </Button>
      </CardContent>
    </Card>
  );
}

function ParentFieldAdded() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-bedding" />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <GitBranch className="size-5 text-primary" aria-hidden />
          <div>
            <p className="font-medium">New optional field: Season</p>
            <p className="text-sm text-muted-foreground">
              Inherited by every live Bedding subtype.
            </p>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Affected types" value="6" />
          <Stat label="Affected items" value="29" />
          <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs text-muted-foreground">Result</p>
            <p className="mt-1 font-semibold text-primary">Compatible</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Optional fields do not require a migration through subtypes. The client can add Season to
          any item later.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function ParentChangeRefused() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-sheet" />
      </CardHeader>
      <CardContent>
        <Refusal title="Published type parent cannot change">
          Sheet is published with parent Bedding. This editor draws the refusal; it does not offer a
          migration.
        </Refusal>
      </CardContent>
    </Card>
  );
}

function ParentMigrationRefused() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-bedding" />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <LockKeyhole className="size-5 text-muted-foreground" aria-hidden />
          <div>
            <p className="font-medium">Required changes stop at the parent boundary</p>
            <p className="text-sm text-muted-foreground">
              Bedding has live subtypes, so making a field required would need a migration through
              every descendant.
            </p>
          </div>
        </div>
        <Refusal
          title="Cannot make Bedding field required"
          code="migration_through_subtypes_unsupported"
        >
          The web editor does not invent a migration. Keep the field optional or make the change
          through the supported catalogue workflow.
        </Refusal>
      </CardContent>
    </Card>
  );
}

/** Refusal and compatibility states for parent, field and archive operations. */
export function RulesEditor({
  state,
}: {
  state:
    | 'depth-cap'
    | 'key-shadowed'
    | 'archive-with-children'
    | 'parent-field-added'
    | 'parent-change-refused'
    | 'parent-migration-refused';
}) {
  if (state === 'depth-cap') return <DepthCap />;
  if (state === 'key-shadowed') return <KeyShadowed />;
  if (state === 'archive-with-children') return <ArchiveWithChildren />;
  if (state === 'parent-field-added') return <ParentFieldAdded />;
  if (state === 'parent-change-refused') return <ParentChangeRefused />;
  return <ParentMigrationRefused />;
}
