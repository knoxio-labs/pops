import { Save, Undo2 } from 'lucide-react';
import { useState } from 'react';

import {
  expressionStats,
  ownerType,
  issueBelongsTo,
  slotTypes,
  valueTypeLabel,
} from '@pops/app-inventory/design';
import { Badge, Button, cn } from '@pops/ui';

import { McpPublishRoute, MigrationRequiredRefusal, SaveRefused } from './editor-notices';
import { ExpressionPanel } from './expression-panel';
import { NodeInspector } from './node-inspector';
import { OverridePolicyControl } from './override-policy';
import { ResultPreview } from './result-preview';

import type { ComputedScenario, InspectorPanel } from './scenario';

const DRAFT_REVISION = 13;
const AFFECTED_ITEMS = 184;

const SAVE_BADGES: Record<ComputedScenario['save'], string> = {
  saved: 'Saved to draft',
  unsaved: 'Unsaved changes',
  refused: 'Not saved',
};

function EditorHeader({ scenario }: { scenario: ComputedScenario }) {
  const emptySlots = expressionStats(scenario.expression).emptySlots;
  const canSave = scenario.save !== 'saved' && emptySlots === 0;
  return (
    <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">
          Item types › {ownerType(scenario.context).label}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{scenario.field.label}</h2>
          <Badge variant="outline">{valueTypeLabel(scenario.field.type)}</Badge>
          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
            Computed
          </Badge>
          {scenario.field.isNew && <Badge variant="outline">New field</Badge>}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Draft revision {DRAFT_REVISION} ·{' '}
          <span className={cn(scenario.save === 'refused' && 'font-medium text-destructive')}>
            {SAVE_BADGES[scenario.save]}
            {scenario.save === 'refused' && `: the flagged node shows what to change`}
          </span>
          {emptySlots > 0 &&
            ` · fill ${emptySlots === 1 ? 'the empty slot' : 'every empty slot'} to save`}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button variant="outline" disabled={scenario.save === 'saved'}>
          <Undo2 className="h-4 w-4" />
          Discard
        </Button>
        <Button disabled={!canSave}>
          <Save className="h-4 w-4" />
          Save to draft
        </Button>
      </div>
    </div>
  );
}

function PublishRoute({ scenario }: { scenario: ComputedScenario }) {
  if (scenario.publish === 'migration-refused')
    return (
      <MigrationRequiredRefusal
        draftRevision={DRAFT_REVISION}
        changes={[
          {
            field: scenario.field.label,
            change: scenario.field.isNew ? 'new computed field' : 'calculation changed',
            items: AFFECTED_ITEMS,
          },
        ]}
      />
    );
  return <McpPublishRoute draftRevision={DRAFT_REVISION} />;
}

/**
 * The web catalogue editor's computed-field authoring surface: build or edit
 * the expression as an outline plus an inspector, set the override policy,
 * and try the unsaved draft on one item. `embedded` drops the field header
 * when the editor sits inside the type editor's Computation tab.
 */
export function ComputedFieldEditor({
  scenario,
  embedded = false,
}: {
  scenario: ComputedScenario;
  embedded?: boolean;
}) {
  const [selectedPath, setSelectedPath] = useState(scenario.selectedPath);
  const [panel, setPanel] = useState<InspectorPanel>(scenario.panel);
  const types = slotTypes(scenario.context, scenario.expression, scenario.field.type);
  const select = (path: string) => {
    setSelectedPath(path);
    setPanel('node');
  };
  return (
    <div className="space-y-4">
      {!embedded && <EditorHeader scenario={scenario} />}
      {embedded && scenario.save === 'refused' && <SaveRefused issues={scenario.issues} />}
      <PublishRoute scenario={scenario} />
      <OverridePolicyControl policy={scenario.policy} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <ExpressionPanel
            context={scenario.context}
            expression={scenario.expression}
            selectedPath={selectedPath}
            issues={scenario.issues}
            onSelect={select}
          />
        </div>
        <section className="rounded-lg border p-3" aria-label="Selected node">
          <NodeInspector
            context={scenario.context}
            root={scenario.expression}
            path={selectedPath}
            panel={panel}
            types={types}
            issue={scenario.issues.find((issue) => issueBelongsTo(issue.path, selectedPath))}
            followOpen={scenario.followOpen === true && selectedPath === scenario.selectedPath}
            onPanel={setPanel}
          />
        </section>
      </div>
      <ResultPreview preview={scenario.preview} items={scenario.pickerItems} />
    </div>
  );
}
