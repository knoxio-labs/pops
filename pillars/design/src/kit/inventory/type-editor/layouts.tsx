import { electronicsField } from '@/fixtures/inventory-type-fields';

import { Card, CardContent, CardHeader, cn } from '@pops/ui';

import { CatalogueList, FieldOutline } from './catalogue-navigation';
import { CreateType } from './create-type';
import { EditorHeader, FieldFormFooter, FieldInspector, PublishBar } from './editor-frame';
import { BlockingNotice } from './notices';

import type { TypeEditorMode } from './types';

/** A layout rendering one editor mode with one Electronics field selected in the outline. */
export interface EditorLayoutProps {
  mode: TypeEditorMode;
  fieldKey?: string;
}

const DEFAULT_FIELD_KEY = 'manufacturer';

/**
 * Height budget for the focused editor's own card below the web frame's top
 * bar, page padding and this screen's own header, so the field outline is
 * the only column that scrolls and the page itself never does at 1280 or
 * 1024 wide.
 */
const CARD_HEIGHT = 'lg:h-[calc(100vh-13.25rem)]';

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
            <>
              <FieldInspector mode={mode} field={field} />
              <FieldFormFooter field={field} />
            </>
          )}
          {isBlockingMode(mode) && <BlockingNotice mode={mode} />}
          {canPublish(mode) && <PublishBar mode={mode} />}
        </CardContent>
      </Card>
    </div>
  );
}

const STEPS = ['Type details', 'Fields', 'Review & publish'] as const;

/**
 * Focused section editor with a permanent type list, explicit type, fields
 * and publish stages. The field outline scrolls within its own column; the
 * header, steps, inspector and publish bar stay in view at 1280 and 1024
 * wide, so the page itself never scrolls.
 */
export function FocusedEditor({ mode, fieldKey = DEFAULT_FIELD_KEY }: EditorLayoutProps) {
  const creating = isCreatingMode(mode);
  const field = electronicsField(fieldKey);
  const activeStep = creating ? 0 : 1;
  return (
    <div className="grid gap-5 lg:grid-cols-4">
      <div className="lg:col-span-1">
        <CatalogueList />
      </div>
      <Card className={cn('lg:col-span-3 lg:flex lg:flex-col', CARD_HEIGHT)}>
        <CardHeader className="lg:shrink-0">
          <EditorHeader creating={creating} />
        </CardHeader>
        <CardContent className="space-y-6 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:overflow-hidden">
          <div className="grid gap-2 sm:grid-cols-3 lg:shrink-0">
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
            <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              <CreateType keyCollision={mode === 'key-collision'} />
            </div>
          ) : (
            <div className="grid gap-8 lg:min-h-[14rem] lg:flex-1 lg:auto-rows-fr lg:grid-cols-4">
              <div className="lg:col-span-1 lg:h-full lg:min-h-0 lg:overflow-y-auto">
                <FieldOutline selectedKey={fieldKey} />
              </div>
              <div className="space-y-6 lg:col-span-3 lg:h-full lg:min-h-0 lg:overflow-y-auto">
                <FieldInspector mode={mode} field={field} />
                <FieldFormFooter field={field} />
                {isBlockingMode(mode) && <BlockingNotice mode={mode} />}
              </div>
            </div>
          )}
          {canPublish(mode) && (
            <div className="lg:shrink-0">
              <PublishBar mode={mode} />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
