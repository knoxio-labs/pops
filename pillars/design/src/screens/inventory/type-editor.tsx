import { catalogueRevision } from '@/fixtures/inventory-type-catalogue';
import { PrimitiveFieldState } from '@/fixtures/inventory-type-editor-field-states';
import { CatalogueList } from '@/kit/inventory/type-editor/catalogue-navigation';
import { FocusedEditor, WorkspaceEditor } from '@/kit/inventory/type-editor/layouts';
import { Database, Plus } from 'lucide-react';

import { Button, ButtonPrimitive, PageHeader } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { CatalogueFieldKind } from '@/fixtures/inventory-type-catalogue';
import type { TypeEditorLayout, TypeEditorMode } from '@/kit/inventory/type-editor/types';

export const meta: ScreenMeta = { title: 'Type editor', order: 9, frame: 'web' };

interface TypeEditorProps {
  mode?: TypeEditorMode;
  layout?: TypeEditorLayout;
  fieldKind?: CatalogueFieldKind;
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

function EditorLayout({ mode, layout }: { mode: TypeEditorMode; layout: TypeEditorLayout }) {
  if (layout === 'workspace') return <WorkspaceEditor mode={mode} />;
  return <FocusedEditor mode={mode} />;
}

/**
 * Owner-facing catalogue editor design covering the complete type, field,
 * compatibility and publication workflow from Inventory ADR-002 D5.
 */
export function TypeEditor({ mode = 'edit', layout = 'focused', fieldKind }: TypeEditorProps) {
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
      {fieldKind === undefined ? (
        <EditorLayout mode={mode} layout={layout} />
      ) : (
        <PrimitiveFieldState kind={fieldKind} layout={layout} />
      )}
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
    'reference-targets': () => <TypeEditor fieldKind="reference" layout={layout} />,
    'reference-items-and-locations': () => <TypeEditor fieldKind="reference" layout={layout} />,
    'primitive-short-text': () => <TypeEditor fieldKind="short_text" layout={layout} />,
    'primitive-long-text': () => <TypeEditor fieldKind="long_text" layout={layout} />,
    'primitive-integer': () => <TypeEditor fieldKind="integer" layout={layout} />,
    'primitive-decimal': () => <TypeEditor fieldKind="decimal" layout={layout} />,
    'primitive-boolean': () => <TypeEditor fieldKind="boolean" layout={layout} />,
    'primitive-enum': () => <TypeEditor fieldKind="enum" layout={layout} />,
    'primitive-measurement': () => <TypeEditor fieldKind="measurement" layout={layout} />,
    'primitive-date': () => <TypeEditor fieldKind="date" layout={layout} />,
    'primitive-date-time': () => <TypeEditor fieldKind="date_time" layout={layout} />,
    'primitive-url': () => <TypeEditor fieldKind="url" layout={layout} />,
    'primitive-reference': () => <TypeEditor fieldKind="reference" layout={layout} />,
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
