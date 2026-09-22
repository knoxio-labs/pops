import { Archive, Check, Eye, Save, Settings2, Sparkles } from 'lucide-react';

import { Badge, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { ComputedEditor } from './computed-editor';
import { PrimitiveSettings } from './primitive-settings';
import { EnumOptions, ReferenceTargets } from './special-settings';
import { ValidationPreview } from './validation-preview';

import type { TypeEditorMode } from './types';

/** Type-level identity, draft status and primary actions. */
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
      <div className="flex flex-wrap items-center gap-2">
        {creating && <Badge variant="outline">Unsaved</Badge>}
        {!creating && (
          <Button variant="outline">
            <Archive className="h-4 w-4" />
            Archive
          </Button>
        )}
        {!creating && (
          <Button>
            <Save className="h-4 w-4" />
            Save draft
          </Button>
        )}
      </div>
    </div>
  );
}

function Inspector({ mode }: { mode: TypeEditorMode }) {
  if (mode === 'enum') return <EnumOptions />;
  if (mode === 'reference') return <ReferenceTargets />;
  if (mode === 'preview') return <ValidationPreview />;
  if (mode === 'computed') return <ComputedEditor />;
  if (mode === 'dependency-error') return <ComputedEditor error="dependency" />;
  if (mode === 'cycle') return <ComputedEditor error="cycle" />;
  return <PrimitiveSettings />;
}

function editorTab(mode: TypeEditorMode): 'field' | 'computed' | 'preview' {
  if (mode === 'preview') return 'preview';
  if (mode === 'computed' || mode === 'dependency-error' || mode === 'cycle') return 'computed';
  return 'field';
}

/** Field settings, computed-expression and validation-preview panels. */
export function EditorTabs({ mode }: { mode: TypeEditorMode }) {
  const tab = editorTab(mode);
  return (
    <Tabs value={tab} className="space-y-5">
      <TabsList className="h-auto min-h-11 flex-wrap justify-start">
        <TabsTrigger value="field" className="min-h-9">
          <Settings2 className="h-4 w-4" />
          Field settings
        </TabsTrigger>
        <TabsTrigger value="computed" className="min-h-9">
          <Sparkles className="h-4 w-4" />
          Computation
        </TabsTrigger>
        <TabsTrigger value="preview" className="min-h-9">
          <Eye className="h-4 w-4" />
          Validation preview
        </TabsTrigger>
      </TabsList>
      <TabsContent value="field">
        <Inspector mode={mode} />
      </TabsContent>
      <TabsContent value="computed">
        <Inspector mode={mode} />
      </TabsContent>
      <TabsContent value="preview">
        <Inspector mode={mode} />
      </TabsContent>
    </Tabs>
  );
}

/** Publication readiness summary and final review action. */
export function PublishBar() {
  return (
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
        <Sparkles className="h-4 w-4" />
        Review and publish
      </Button>
    </div>
  );
}
