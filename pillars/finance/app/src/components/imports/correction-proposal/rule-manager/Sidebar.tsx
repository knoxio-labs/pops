import { Plus, Search } from 'lucide-react';
import { lazy, Suspense } from 'react';

import { Button, Input } from '@pops/ui';

import type { LocalOp } from '../../correction-proposal-shared';
import type { CorrectionRule } from '../../RulePicker';

const BrowseRulesSidebar = lazy(() =>
  import('../../BrowseRulesSidebar').then((m) => ({ default: m.BrowseRulesSidebar }))
);

interface SidebarProps {
  search: string;
  onSearchChange: (v: string) => void;
  orderedMerged: CorrectionRule[];
  orderedFiltered: CorrectionRule[];
  /** Rules the server holds, which may exceed the window rendered here. */
  totalRules: number;
  windowComplete: boolean;
  canDragReorder: boolean;
  selectedRuleId: string | null;
  onSelectRule: (ruleId: string) => void;
  onReorderFullList: (reordered: CorrectionRule[], movedRuleId: string) => void;
  localOps: LocalOp[];
  onAddNewRule: () => void;
}

/**
 * Says how many rules were searched over, not just how many matched: the window
 * is capped, so "3 rules" over a partial set reads as the whole answer.
 */
function RuleCount({
  shown,
  total,
  windowComplete,
  search,
}: {
  shown: number;
  total: number;
  windowComplete: boolean;
  search: string;
}) {
  const suffix = search ? ` matching "${search}"` : '';
  if (windowComplete) {
    return (
      <>
        {shown} rule{shown === 1 ? '' : 's'}
        {suffix}
      </>
    );
  }
  return (
    <>
      {shown}
      {suffix} of {total} rules
    </>
  );
}

function SidebarHeader(props: SidebarProps) {
  return (
    <>
      <div className="px-3 py-2 border-b">
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={props.search}
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder="Search rules…"
            className="pl-7 h-8 text-xs"
          />
        </div>
      </div>
      <div className="px-3 py-1.5 text-2xs text-muted-foreground border-b space-y-0.5">
        <div>
          <RuleCount
            shown={props.orderedFiltered.length}
            total={props.totalRules}
            windowComplete={props.windowComplete}
            search={props.search}
          />
        </div>
        {props.search.trim() !== '' && (
          <div className="text-2xs text-muted-foreground/90">
            Clear search to drag rules into priority order.
          </div>
        )}
        {!props.windowComplete && (
          <div className="text-2xs text-warning">
            Only part of the rule set is listed — search covers what is shown, and a drag moves the
            dragged rule alone.
          </div>
        )}
      </div>
    </>
  );
}

export function Sidebar(props: SidebarProps) {
  return (
    <div className="flex flex-col min-h-0 border-r">
      <SidebarHeader {...props} />
      <div className="flex-1 overflow-auto">
        <Suspense fallback={<div className="p-3 text-xs text-muted-foreground">Loading…</div>}>
          <BrowseRulesSidebar
            canDragReorder={props.canDragReorder}
            orderedMerged={props.orderedMerged}
            orderedFiltered={props.orderedFiltered}
            selectedRuleId={props.selectedRuleId}
            localOps={props.localOps}
            onSelectRule={props.onSelectRule}
            onReorderFullList={props.onReorderFullList}
          />
        </Suspense>
      </div>
      <div className="border-t p-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full justify-start"
          onClick={props.onAddNewRule}
        >
          <Plus className="mr-1 h-3.5 w-3.5" /> Add new rule
        </Button>
      </div>
    </div>
  );
}
