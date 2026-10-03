import { useState } from 'react';

import type { ActionsPart, BatchAction } from '../chat-hooks/message-parts';
import type { BatchDecision } from '../chat-hooks/useBatchDecision';

interface BatchSelectionState {
  batchId: string;
  ticked: Set<string>;
  alwaysAllow: Set<string>;
}

function initialSelection(part: ActionsPart): BatchSelectionState {
  return {
    batchId: part.batchId,
    ticked: new Set(
      part.actions.filter((action) => action.status === 'pending').map((action) => action.actionId)
    ),
    alwaysAllow: new Set(),
  };
}

function selectionForPart(part: ActionsPart, stored: BatchSelectionState): BatchSelectionState {
  return stored.batchId === part.batchId ? stored : initialSelection(part);
}

/**
 * Builds a batch decision in action order. Ticked action ids are approved, the rest are
 * rejected, and an allowed tool is included only when one of its actions is ticked.
 */
export function buildDecision(
  actions: BatchAction[],
  ticked: ReadonlySet<string>,
  alwaysAllow: ReadonlySet<string>
): BatchDecision {
  const tools = Array.from(new Set(actions.map((action) => action.tool)));
  const tickedTools = new Set(
    actions.filter((action) => ticked.has(action.actionId)).map((action) => action.tool)
  );

  return {
    approve: actions
      .filter((action) => ticked.has(action.actionId))
      .map((action) => action.actionId),
    reject: actions
      .filter((action) => !ticked.has(action.actionId))
      .map((action) => action.actionId),
    alwaysAllow: tools.filter((tool) => alwaysAllow.has(tool) && tickedTools.has(tool)),
  };
}

/**
 * Tracks checked actions and per-tool conversation permissions for one batch. Pending actions
 * start checked, tools start disallowed, and selection resets when the batch id changes.
 */
export function useBatchSelection(part: ActionsPart): {
  ticked: ReadonlySet<string>;
  alwaysAllow: ReadonlySet<string>;
  toggleAction: (actionId: string) => void;
  toggleTool: (tool: string) => void;
  tools: string[];
} {
  const [stored, setStored] = useState(() => initialSelection(part));
  const selection = selectionForPart(part, stored);
  const tools = Array.from(new Set(part.actions.map((action) => action.tool)));

  const toggleAction = (actionId: string) => {
    setStored((current) => {
      const next = selectionForPart(part, current);
      const ticked = new Set(next.ticked);
      if (ticked.has(actionId)) ticked.delete(actionId);
      else ticked.add(actionId);
      return { ...next, ticked };
    });
  };

  const toggleTool = (tool: string) => {
    setStored((current) => {
      const next = selectionForPart(part, current);
      const alwaysAllow = new Set(next.alwaysAllow);
      if (alwaysAllow.has(tool)) alwaysAllow.delete(tool);
      else alwaysAllow.add(tool);
      return { ...next, alwaysAllow };
    });
  };

  return { ...selection, toggleAction, toggleTool, tools };
}
