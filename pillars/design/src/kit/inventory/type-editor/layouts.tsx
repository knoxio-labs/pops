import { electronicsField } from '@/fixtures/inventory-type-fields';

import { Card, CardContent, CardHeader, cn } from '@pops/ui';

import { CatalogueList, FieldOutline } from './catalogue-navigation';
import { CreateType } from './create-type';
import { EditorHeader, EditorTabs, PublishBar } from './editor-frame';
import { BlockingNotice } from './notices';

import type { TypeEditorMode } from './types';

/** A layout rendering one editor mode with one Electronics field selected in the outline. */
export interface EditorLayoutProps {
  mode: TypeEditorMode;
  fieldKey?: string;
}

const DEFAULT_FIELD_KEY = 'connectors';

function isBlockingMode(
  mode: TypeEditorMode
): mode is Extract<TypeEditorMode, 'archive' | 'stale' | 'destructive'> {
  return mode === 'archive' || mode === 'stale' || mode === 'destructive';
}

function canPublish(mode: TypeEditorMode): boolean {
  return (
    mode !== 'create' &&
    mode !== 'key-collision' &&
    mode !== 'archive' &&
    mode !== 'stale' &&
    mode !== 'destructive'
  );
}

function isCreatingMode(mode: TypeEditorMode): boolean {
  return mode === 'create' || mode === 'key-collision';
}

/** Persistent type list, field outline and inspector workspace. */
export function WorkspaceEditor({ mode, fieldKey = DEFAULT_FIELD_KEY }: EditorLayoutProps) {
  const creating = isCreatingMode(mode);
  const field = electronicsField(fieldKey);
  return (
    <div className="grid gap-4 lg:grid-cols-12">
      <Card className="lg:col-span-3">
        <CardContent className="p-4">
          <CatalogueList compact />
        </CardContent>
      </Card>
      <Card className="lg:col-span-3">
        <CardContent className="p-4">
          <FieldOutline selectedKey={fieldKey} />
        </CardContent>
      </Card>
      <Card className="lg:col-span-6">
        <CardHeader>
          <EditorHeader creating={creating} />
        </CardHeader>
        <CardContent className="space-y-5">
          {creating ? (
            <CreateType keyCollision={mode === 'key-collision'} />
          ) : (
            <EditorTabs mode={mode} field={field} />
          )}
          {isBlockingMode(mode) && <BlockingNotice mode={mode} />}
          {canPublish(mode) && <PublishBar />}
        </CardContent>
      </Card>
    </div>
  );
}

const STEPS = ['Type details', 'Fields', 'Review & publish'] as const;

/** Focused section editor with explicit type, fields and publish stages. */
export function FocusedEditor({ mode, fieldKey = DEFAULT_FIELD_KEY }: EditorLayoutProps) {
  const creating = isCreatingMode(mode);
  const field = electronicsField(fieldKey);
  const activeStep = creating ? 0 : 1;
  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <Card>
        <CardHeader>
          <EditorHeader creating={creating} />
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-2 sm:grid-cols-3">
            {STEPS.map((step, index) => (
              <div
                key={step}
                className={cn(
                  'flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm',
                  index === activeStep
                    ? 'border-primary bg-primary/10 font-medium text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full border text-xs">
                  {index + 1}
                </span>
                {step}
              </div>
            ))}
          </div>
          {creating ? (
            <CreateType keyCollision={mode === 'key-collision'} />
          ) : (
            <div className="grid gap-8 lg:grid-cols-4">
              <div className="lg:col-span-1">
                <FieldOutline selectedKey={fieldKey} />
              </div>
              <div className="space-y-6 lg:col-span-3">
                <EditorTabs mode={mode} field={field} />
                {isBlockingMode(mode) && <BlockingNotice mode={mode} />}
              </div>
            </div>
          )}
          {canPublish(mode) && <PublishBar />}
        </CardContent>
      </Card>
    </div>
  );
}
