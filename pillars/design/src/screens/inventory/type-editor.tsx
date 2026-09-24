import { catalogueRevision } from '@/fixtures/inventory-type-catalogue';
import { CatalogueList } from '@/kit/inventory/type-editor/catalogue-navigation';
import { FocusedEditor, WorkspaceEditor } from '@/kit/inventory/type-editor/layouts';
import { Database, Plus } from 'lucide-react';

import { Button, ButtonPrimitive, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { TypeEditorLayout, TypeEditorMode } from '@/kit/inventory/type-editor/types';

export const meta: ScreenMeta = { title: 'Type editor', order: 9, frame: 'web' };

interface TypeEditorProps {
  mode?: TypeEditorMode;
  layout?: TypeEditorLayout;
  fieldKey?: string;
}

function TypeList() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Item types"
        description="Define the fields and behaviour available to inventory items."
        actions={
          <Button>
            <Plus className="h-4 w-4" />
            New type
          </Button>
        }
      />
      <div className="rounded-lg border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
        Published revision {catalogueRevision.published} · last published{' '}
        {catalogueRevision.publishedAt} by {catalogueRevision.editor}
      </div>
      <CatalogueList />
    </div>
  );
}

function EditorLayout({
  mode,
  layout,
  fieldKey,
}: {
  mode: TypeEditorMode;
  layout: TypeEditorLayout;
  fieldKey?: string;
}) {
  if (layout === 'workspace') return <WorkspaceEditor mode={mode} fieldKey={fieldKey} />;
  return <FocusedEditor mode={mode} fieldKey={fieldKey} />;
}

/**
 * Owner-facing catalogue editor design covering the complete type, field,
 * compatibility and publication workflow from Inventory ADR-002 D5.
 */
export function TypeEditor({ mode = 'edit', layout = 'focused', fieldKey }: TypeEditorProps) {
  if (mode === 'list') return <TypeList />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Type catalogue"
        description="Edit a draft, validate every affected item, then publish one atomic revision."
        actions={
          <ButtonPrimitive variant="outline" className="min-h-11">
            <Database className="h-4 w-4" />
            Audit history
          </ButtonPrimitive>
        }
      />
      <EditorLayout mode={mode} layout={layout} fieldKey={fieldKey} />
    </div>
  );
}

/** Builds the same named catalogue conditions for either layout under review. */
export function createTypeEditorStates(layout: TypeEditorLayout): ScreenStates {
  return {
    'type-list': () => <TypeEditor mode="list" layout={layout} />,
    create: () => <TypeEditor mode="create" layout={layout} />,
    'key-collision': () => <TypeEditor mode="key-collision" layout={layout} />,
    edit: () => <TypeEditor mode="edit" layout={layout} />,
    archive: () => <TypeEditor mode="archive" layout={layout} />,
    'enum-options': () => <TypeEditor mode="enum" layout={layout} />,
    'reference-targets': () => <TypeEditor fieldKey="works_with" layout={layout} />,
    'reference-items-and-locations': () => <TypeEditor fieldKey="stored_with" layout={layout} />,
    'primitive-short-text': () => <TypeEditor fieldKey="manufacturer" layout={layout} />,
    'primitive-long-text': () => <TypeEditor fieldKey="notes" layout={layout} />,
    'primitive-integer': () => <TypeEditor fieldKey="package_count" layout={layout} />,
    'primitive-decimal': () => <TypeEditor fieldKey="unit_price" layout={layout} />,
    'primitive-boolean': () => <TypeEditor fieldKey="powered" layout={layout} />,
    'primitive-enum': () => <TypeEditor fieldKey="connectors" layout={layout} />,
    'primitive-measurement': () => <TypeEditor fieldKey="weight" layout={layout} />,
    'primitive-date': () => <TypeEditor fieldKey="purchased_on" layout={layout} />,
    'primitive-date-time': () => <TypeEditor fieldKey="registered_at" layout={layout} />,
    'primitive-url': () => <TypeEditor fieldKey="product_url" layout={layout} />,
    'primitive-reference': () => <TypeEditor fieldKey="home_location" layout={layout} />,
    'validation-preview': () => <TypeEditor mode="preview" layout={layout} />,
    'stale-revision': () => <TypeEditor mode="stale" layout={layout} />,
    'destructive-refusal': () => <TypeEditor mode="destructive" layout={layout} />,
    'computed-expression': () => <TypeEditor mode="computed" layout={layout} />,
    'dependency-error': () => <TypeEditor mode="dependency-error" layout={layout} />,
    'dependency-cycle': () => <TypeEditor mode="cycle" layout={layout} />,
  };
}

export const states = createTypeEditorStates('focused');

export default function TypeEditorScreen() {
  return <TypeEditor />;
}
