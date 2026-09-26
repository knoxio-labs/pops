import { inventoryCatalogueTypes } from '@/fixtures/inventory-type-catalogue';
import { Plus } from 'lucide-react';

import { Button, Card, CardContent, CardHeader } from '@pops/ui';

import { InheritedFields } from './type-tree-editor-inherited';
import { CreateSubtype, EditorTitle, ParentChoiceList } from './type-tree-editor-parts';

function InheritedEditor() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-pillowcase" />
      </CardHeader>
      <CardContent>
        <InheritedFields />
      </CardContent>
    </Card>
  );
}

function ParentChoicesEditor() {
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId="type-pillows" />
      </CardHeader>
      <CardContent className="space-y-5">
        <ParentChoiceList />
        <div className="flex justify-end border-t pt-4">
          <Button disabled>Save parent</Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The child list states, including the empty leaf and empty parent variants. */
export function ChildrenState({ typeId, heading }: { typeId: string; heading: string }) {
  const children = inventoryCatalogueTypes.filter(
    (type) => type.parentTypeId === typeId && type.status !== 'archived'
  );
  return (
    <Card>
      <CardHeader>
        <EditorTitle typeId={typeId} />
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-lg border border-dashed p-5">
          <Plus className="mt-0.5 size-5 text-primary" aria-hidden />
          <div>
            <h3 className="font-medium">{heading}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Any type can become a parent later. Existing items keep this type until you refine
              them.
            </p>
          </div>
        </div>
        {children.length > 0 ? (
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Live children</h3>
            {children.map((child) => (
              <div
                key={child.id}
                className="flex min-h-11 items-center gap-3 rounded-md border px-3"
              >
                <span className="min-w-0 flex-1 text-sm">{child.label}</span>
                <span className="text-xs text-muted-foreground">{child.itemCount} items</span>
              </div>
            ))}
          </div>
        ) : null}
        <Button variant="outline">
          <Plus className="size-4" aria-hidden />
          Add subtype
        </Button>
      </CardContent>
    </Card>
  );
}

/** Maps the simple editor states to their content card. */
export function EditorPanel({
  state,
}: {
  state:
    | 'create-subtype'
    | 'parent-choices'
    | 'inherited-fields'
    | 'leaf-no-children'
    | 'parent-no-children';
}) {
  if (state === 'create-subtype') return <CreateSubtype />;
  if (state === 'parent-choices') return <ParentChoicesEditor />;
  if (state === 'inherited-fields') return <InheritedEditor />;
  if (state === 'leaf-no-children') {
    return <ChildrenState typeId="type-mattress-protector" heading="Leaf type with no children" />;
  }
  return <ChildrenState typeId="type-blanket" heading="Parent type with no children yet" />;
}
