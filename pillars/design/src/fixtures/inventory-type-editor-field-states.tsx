import { electronicsFields } from '@/fixtures/inventory-type-fields';
import { cataloguePrimitiveDefinitions } from '@/fixtures/inventory-type-primitives';
import { CatalogueList } from '@/kit/inventory/type-editor/catalogue-navigation';
import { Check, Save } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardHeader, Label, Switch } from '@pops/ui';

import { FieldIdentity, KindAndCardinality } from './inventory-type-editor-field-controls';
import { KindSettings } from './inventory-type-editor-field-special';

import type { CatalogueFieldKind, CatalogueFieldSummary } from '@/fixtures/inventory-type-fields';
import type { CataloguePrimitiveDefinition } from '@/fixtures/inventory-type-primitives';
import type { TypeEditorLayout } from '@/kit/inventory/type-editor/types';

function fieldForKind(kind: CatalogueFieldKind): CatalogueFieldSummary {
  const field = electronicsFields.find((candidate) => candidate.kind === kind);
  if (field === undefined) throw new Error(`Missing fictional field for ${kind}`);
  return field;
}

function definitionForKind(kind: CatalogueFieldKind): CataloguePrimitiveDefinition {
  const definition = cataloguePrimitiveDefinitions.find((candidate) => candidate.kind === kind);
  if (definition === undefined) throw new Error(`Missing primitive definition for ${kind}`);
  return definition;
}

function PrimitivePreview({ definition }: { definition: CataloguePrimitiveDefinition }) {
  return (
    <section className="rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Canonical value preview</p>
          <p className="mt-1 break-all font-mono text-sm">{definition.example}</p>
        </div>
        <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
          <Check className="h-3 w-3" /> Valid {definition.label.toLowerCase()}
        </Badge>
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{definition.contract}</p>
    </section>
  );
}

function Inspector({ kind }: { kind: CatalogueFieldKind }) {
  const field = fieldForKind(kind);
  const definition = definitionForKind(kind);
  return (
    <div className="space-y-5">
      <FieldIdentity field={field} />
      <KindAndCardinality kind={kind} definition={definition} />
      <KindSettings kind={kind} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor={`required-${kind}`}>Required</Label>
            <p className="mt-1 text-xs text-muted-foreground">Items must carry a value.</p>
          </div>
          <Switch id={`required-${kind}`} />
        </div>
        <div className="flex min-h-11 items-start justify-between gap-4 rounded-lg border p-3">
          <div>
            <Label htmlFor={`highlighted-${kind}`}>Highlighted</Label>
            <p className="mt-1 text-xs text-muted-foreground">Show in item summaries.</p>
          </div>
          <Switch id={`highlighted-${kind}`} defaultChecked={field.highlighted} />
        </div>
      </div>
      <PrimitivePreview definition={definition} />
    </div>
  );
}

function FieldCard({ kind }: { kind: CatalogueFieldKind }) {
  const definition = definitionForKind(kind);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{definition.label} field</h2>
            <Badge variant="outline">Stored</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Draft revision 13 · shape locks after publication
          </p>
        </div>
        <Button>
          <Save className="h-4 w-4" /> Save draft
        </Button>
      </CardHeader>
      <CardContent>
        <Inspector kind={kind} />
      </CardContent>
    </Card>
  );
}

/** Renders one exact ADR-002 primitive definition in either catalogue-editor layout. */
export function PrimitiveFieldState({
  kind,
  layout,
}: {
  kind: CatalogueFieldKind;
  layout: TypeEditorLayout;
}) {
  if (layout === 'workspace') {
    return (
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-3">
          <CardContent className="p-4">
            <CatalogueList compact />
          </CardContent>
        </Card>
        <div className="lg:col-span-9">
          <FieldCard kind={kind} />
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl">
      <FieldCard kind={kind} />
    </div>
  );
}
