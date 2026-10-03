import { Button, CheckboxInput, cn } from '@pops/ui';

import { buildDecision, useBatchSelection } from './useBatchSelection';

import type { ActionStatus, ActionsPart, BatchAction } from '../chat-hooks/message-parts';
import type { BatchDecisionApi } from '../chat-hooks/useBatchDecision';

interface ActionsCardProps {
  part: ActionsPart;
  decisions: BatchDecisionApi | null;
}

interface ActionRowProps {
  action: BatchAction;
  canDecide: boolean;
  deciding: boolean;
  ticked: boolean;
  onToggle: () => void;
}

type BatchSelection = ReturnType<typeof useBatchSelection>;

interface DecisionControlsProps {
  part: ActionsPart;
  decisions: BatchDecisionApi;
  selection: BatchSelection;
  deciding: boolean;
}

function actionStatusLabel(status: Exclude<ActionStatus, 'pending'>): string {
  switch (status) {
    case 'confirmed':
      return 'Confirmed, running';
    case 'executed':
      return 'Done';
    case 'rejected':
      return 'Rejected';
    case 'failed':
      return 'Failed';
  }
}

function ActionRow({ action, canDecide, deciding, ticked, onToggle }: ActionRowProps) {
  return (
    <li className="flex items-start justify-between gap-3 rounded-md border border-border/50 bg-muted/50 p-3">
      <div className="min-w-0 space-y-1">
        {action.status === 'pending' && canDecide ? (
          <CheckboxInput
            checked={ticked}
            disabled={deciding}
            label={action.summary}
            onCheckedChange={onToggle}
          />
        ) : (
          <p className="text-sm font-medium">{action.summary}</p>
        )}
        <p className="break-all text-xs text-muted-foreground">{action.tool}</p>
        {action.status === 'pending' && !canDecide && (
          <p className="text-xs text-muted-foreground">Awaiting your decision</p>
        )}
        {action.status !== 'pending' && (
          <p
            className={cn(
              'text-xs',
              action.status === 'failed' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {actionStatusLabel(action.status)}
          </p>
        )}
      </div>
    </li>
  );
}

function DecisionControls({ part, decisions, selection, deciding }: DecisionControlsProps) {
  const approve = () => {
    if (deciding) return;
    void decisions.decide(
      part.batchId,
      buildDecision(part.actions, selection.ticked, selection.alwaysAllow)
    );
  };

  const rejectAll = () => {
    if (deciding) return;
    void decisions.decide(part.batchId, buildDecision(part.actions, new Set(), new Set()));
  };

  return (
    <>
      <div className="space-y-2">
        {selection.tools.map((tool) => (
          <CheckboxInput
            key={tool}
            checked={selection.alwaysAllow.has(tool)}
            disabled={deciding}
            label={`Always allow ${tool} in this conversation`}
            onCheckedChange={() => selection.toggleTool(tool)}
          />
        ))}
      </div>
      {decisions.error && (
        <p role="alert" className="text-sm text-destructive">
          {decisions.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button disabled={deciding || selection.ticked.size === 0} onClick={approve}>
          Approve ({selection.ticked.size})
        </Button>
        <Button
          className="text-destructive"
          disabled={deciding}
          onClick={rejectAll}
          variant="outline"
        >
          Reject all
        </Button>
      </div>
    </>
  );
}

/** Renders an action batch with editable pending decisions and read-only resolved statuses. */
export function ActionsCard({ part, decisions }: ActionsCardProps) {
  const selection = useBatchSelection(part);
  const canDecide =
    decisions !== null && part.actions.some((action) => action.status === 'pending');
  const deciding = decisions?.decidingBatchId === part.batchId;

  return (
    <section
      aria-label={`Actions for batch ${part.batchId}`}
      className="space-y-3 rounded-lg border border-border/50 bg-muted/50 p-4 text-foreground"
    >
      <h3 className="text-sm font-semibold">Proposed actions</h3>
      <ul className="space-y-2">
        {part.actions.map((action) => (
          <ActionRow
            key={action.actionId}
            action={action}
            canDecide={canDecide}
            deciding={deciding}
            ticked={selection.ticked.has(action.actionId)}
            onToggle={() => selection.toggleAction(action.actionId)}
          />
        ))}
      </ul>
      {canDecide && decisions && (
        <DecisionControls
          part={part}
          decisions={decisions}
          selection={selection}
          deciding={deciding}
        />
      )}
    </section>
  );
}
