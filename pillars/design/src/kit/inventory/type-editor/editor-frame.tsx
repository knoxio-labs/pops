import { Archive, Check, Save, Upload } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { EnumOptions } from './enum-options';
import { FieldSettings } from './field-settings';
import { DryRunValidation } from './validation-preview';

import type { CatalogueFieldSummary } from '@/fixtures/inventory-type-fields';

import type { TypeEditorMode } from './types';

/** Type-level identity and draft status. */
export function EditorHeader({ creating = false }: { creating?: boolean }) {
  return (
    <div className="flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{creating ? 'New item type' : 'Electronics'}</h2>
          {!creating && (
            <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
              Draft revision 13
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          {creating
            ? 'Define identity and add the first field.'
            : '184 items · last published revision 12'}
        </p>
      </div>
      {creating && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Unsaved</Badge>
        </div>
      )}
    </div>
  );
}

interface InspectorProps {
  mode: TypeEditorMode;
  field: CatalogueFieldSummary;
}

function computedErrorFor(mode: TypeEditorMode): 'dependency' | 'cycle' | undefined {
  if (mode === 'dependency-error') return 'dependency';
  if (mode === 'cycle') return 'cycle';
  return undefined;
}

function isComputedMode(mode: TypeEditorMode): boolean {
  return mode === 'computed' || mode === 'dependency-error' || mode === 'cycle';
}

/**
 * The field form's settings, with the computed-field switch opening the
 * builder inline instead of a separate Computation tab.
 */
export function FieldInspector({ field, mode }: InspectorProps) {
  if (mode === 'enum') return <EnumOptions />;
  return (
    <FieldSettings
      field={field}
      computedOpen={isComputedMode(mode)}
      computedError={computedErrorFor(mode)}
    />
  );
}

/** Per-field save/create and archive/restore actions, matching the web editor's form footer. */
export function FieldFormFooter({ field }: { field: CatalogueFieldSummary }) {
  const archived = field.archived === true;
  return (
    <div className="flex flex-wrap justify-between gap-2 border-t pt-4">
      <div>
        {archived ? (
          <Button type="button" variant="outline">
            Restore field
          </Button>
        ) : (
          <Button type="button" variant="outline">
            <Archive className="h-4 w-4" />
            Archive field
          </Button>
        )}
      </div>
      <Button type="button">
        <Save className="h-4 w-4" />
        Save field
      </Button>
    </div>
  );
}

/** Dry-run validation and the final review action, matching the web editor's publish panel. */
export function PublishBar({ mode }: { mode: TypeEditorMode }) {
  return (
    <div className="space-y-3">
      <div className="lg:max-h-56 lg:overflow-y-auto">
        <DryRunValidation ready={mode === 'preview'} />
      </div>
      <div className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <Check className="mt-0.5 h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-medium">Draft validates against 184 affected items</p>
            <p className="text-xs text-muted-foreground">
              3 compatible changes · no migration required
            </p>
          </div>
        </div>
        <Button>
          <Upload className="h-4 w-4" />
          Review and publish
        </Button>
      </div>
    </div>
  );
}
