import { createContext, useContext, useMemo, useState } from 'react';

import { slotTypes } from '../expression/slot-types';
import { ROOT_PATH, nodeAt } from '../expression/tree';

import type { ReactNode } from 'react';

import type { ExpressionContext, ExpressionNode, SlotType, ValueType } from '../expression/model';
import type { ExpressionIssue } from './issues';

/** What the inspector column shows for the selected node. */
export type InspectorPanel = 'node' | 'insert' | 'wrap';

/** The expression under construction and everything the builder's controls act on. */
export interface ExpressionBuilder {
  readonly context: ExpressionContext;
  readonly root: ExpressionNode;
  readonly slots: ReadonlyMap<string, SlotType | undefined>;
  readonly issues: readonly ExpressionIssue[];
  readonly selectedPath: string;
  readonly panel: InspectorPanel;
  readonly followOpen: boolean;
  readonly select: (path: string) => void;
  readonly setPanel: (panel: InspectorPanel) => void;
  readonly setFollowOpen: (open: boolean) => void;
  /** Replaces the tree, then selects `selected` (or keeps the selection when it still exists). */
  readonly change: (next: ExpressionNode, selected?: string) => void;
}

const BuilderContext = createContext<ExpressionBuilder | null>(null);

/** Returns the enclosing expression builder or fails outside its provider. */
export function useBuilder(): ExpressionBuilder {
  const builder = useContext(BuilderContext);
  if (builder === null)
    throw new Error('Expression controls require an ExpressionBuilderProvider.');
  return builder;
}

/** Props of {@link ExpressionBuilderProvider}. */
export interface ExpressionBuilderProviderProps {
  readonly context: ExpressionContext;
  readonly fieldType: ValueType;
  readonly expression: ExpressionNode;
  readonly issues: readonly ExpressionIssue[];
  readonly onExpressionChange: (next: ExpressionNode) => void;
  readonly children: ReactNode;
}

/**
 * Owns the builder's selection and panel while the tree itself stays with the
 * caller, so a save or a preview always reads the tree the author sees.
 */
export function ExpressionBuilderProvider(props: ExpressionBuilderProviderProps) {
  const { context, fieldType, expression, issues, onExpressionChange } = props;
  const [selected, setSelected] = useState(ROOT_PATH);
  const [panel, setPanel] = useState<InspectorPanel>('node');
  const [followOpen, setFollowOpen] = useState(false);
  const slots = useMemo(
    () => slotTypes(context, expression, fieldType),
    [context, expression, fieldType]
  );
  const selectedPath = nodeAt(expression, selected) === undefined ? ROOT_PATH : selected;
  const builder = useMemo<ExpressionBuilder>(() => {
    const select = (path: string) => {
      setSelected(path);
      setPanel('node');
      setFollowOpen(false);
    };
    return {
      context,
      root: expression,
      slots,
      issues,
      selectedPath,
      panel,
      followOpen,
      select,
      setPanel,
      setFollowOpen,
      change: (next, nextSelected) => {
        onExpressionChange(next);
        if (nextSelected !== undefined) select(nextSelected);
        else {
          setPanel('node');
          setFollowOpen(false);
        }
      },
    };
  }, [context, expression, slots, issues, selectedPath, panel, followOpen, onExpressionChange]);
  return <BuilderContext.Provider value={builder}>{props.children}</BuilderContext.Provider>;
}
