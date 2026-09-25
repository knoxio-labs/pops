/**
 * Store here (iOS parity #3): from a container or a place, create new items
 * straight into it or bring existing ones in, one or many. It implements
 * the cross-unit `StoreHereSheetProps`, so the container workspace and the
 * location page open the same sheet.
 */
import { useState } from 'react';

import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { Sheet, SheetPanel } from '../shared/sheet';
import { StateBanner } from '../shared/state-banner';
import { UndoToast } from '../shared/undo-toast';
import { ExistingTab } from './existing-tab';
import { NewTab } from './new-tab';
import {
  carriedLine,
  storeButtonLabel,
  storeCandidates,
  storePlan,
  targetNotice,
} from './store-here-model';

import type { StoreHereSheetProps } from '../shared/contracts';
import type { SheetContentProps } from '../shared/sheet';
import type { TargetNotice } from './store-here-model';

/** Where a review state opens the sheet. */
export interface StoreHereOpening {
  query?: string;
  selected?: readonly string[];
  created?: readonly string[];
  /** The store just ran: the sheet shows what moved, with Undo. */
  stored?: number;
  offline?: boolean;
}

type BodyProps = Omit<StoreHereSheetProps, 'open' | 'onOpenChange'> & { opening: StoreHereOpening };

function toggled(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

interface StoreState {
  tab: 'new' | 'existing';
  setTab: (tab: 'new' | 'existing') => void;
  query: string;
  setQuery: (query: string) => void;
  selected: ReadonlySet<string>;
  toggle: (id: string) => void;
  name: string;
  setName: (name: string) => void;
  created: readonly string[];
  create: () => void;
}

function useStoreState(props: BodyProps): StoreState {
  const { opening } = props;
  const [tab, setTab] = useState<'new' | 'existing'>(props.initialTab ?? 'new');
  const [query, setQuery] = useState(opening.query ?? '');
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set(opening.selected));
  const [name, setName] = useState('');
  const [created, setCreated] = useState<readonly string[]>(opening.created ?? []);
  return {
    tab,
    setTab,
    query,
    setQuery,
    selected,
    toggle: (id) => setSelected(toggled(selected, id)),
    name,
    setName,
    created,
    create: () => {
      props.onCreate?.(name.trim());
      setCreated([name.trim(), ...created]);
      setName('');
    },
  };
}

function Notices({ props, refuse }: { props: BodyProps; refuse: TargetNotice }) {
  const { opening, target } = props;
  return (
    <>
      {opening.offline === true ? (
        <StateBanner
          kind="offline"
          title="No connection. Nothing can be stored until it returns."
        />
      ) : null}
      {refuse === null ? null : (
        <StateBanner
          kind={refuse.tone === 'refuse' ? 'needs-attention' : 'stale'}
          title={refuse.text}
          actionLabel={refuse.tone === 'refuse' ? `Open ${target.name}` : undefined}
        />
      )}
      {opening.stored === undefined ? null : (
        <UndoToast
          concept="move"
          message={`Stored ${opening.stored} items in ${target.name}.`}
          className="w-full shadow-none"
        />
      )}
    </>
  );
}

function StoreBody({
  props,
  state,
  disabled,
}: {
  props: BodyProps;
  state: StoreState;
  disabled: boolean;
}) {
  const { target, world } = props;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Notices props={props} refuse={targetNotice(world, target)} />
      <Tabs
        value={state.tab}
        onValueChange={(value) => state.setTab(value === 'existing' ? 'existing' : 'new')}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="w-full">
          <TabsTrigger value="new">New item</TabsTrigger>
          <TabsTrigger value="existing">Existing items</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="pt-3">
          <NewTab
            targetName={target.name}
            name={state.name}
            onName={state.setName}
            disabled={disabled}
            created={state.created}
            onCreate={state.create}
          />
        </TabsContent>
        <TabsContent value="existing" className="min-h-0 flex-1 pt-3">
          <ExistingTab
            world={world}
            query={state.query}
            onQuery={state.setQuery}
            candidates={storeCandidates(world, target, state.query)}
            selected={state.selected}
            onToggle={state.toggle}
            disabled={disabled}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function StoreFooter({
  props,
  state,
  disabled,
}: {
  props: BodyProps;
  state: StoreState;
  disabled: boolean;
}) {
  if (state.tab === 'new') {
    return (
      <Button variant="outline" size="sm">
        Done
      </Button>
    );
  }
  const plan = storePlan(props.world, props.target, [...state.selected]);
  return (
    <>
      <p className="mr-auto min-w-0 text-xs text-muted-foreground">{carriedLine(plan)}</p>
      <Button variant="ghost" size="sm">
        Done
      </Button>
      <Button
        size="sm"
        disabled={disabled || plan.moving.length === 0}
        onClick={() => props.onStoreExisting?.(plan.moving)}
      >
        {storeButtonLabel(plan)}
      </Button>
    </>
  );
}

function useStoreHere(props: BodyProps): SheetContentProps {
  const state = useStoreState(props);
  const disabled =
    targetNotice(props.world, props.target)?.tone === 'refuse' || props.opening.offline === true;
  const noun = props.target.kind === 'container' ? 'container' : 'place';
  return {
    title: `Store in ${props.target.name}`,
    description: `Create items straight into this ${noun}, or bring in ones you already have.`,
    children: <StoreBody props={props} state={state} disabled={disabled} />,
    footer: <StoreFooter props={props} state={state} disabled={disabled} />,
  };
}

/** The Store here sheet, over the page. */
export function StoreHereSheet({ open, onOpenChange, ...rest }: StoreHereSheetProps) {
  const content = useStoreHere({ ...rest, opening: {} });
  return <Sheet open={open} onOpenChange={onOpenChange} {...content} />;
}

/** The same sheet drawn in place, opened on a review state. */
export function StoreHereSheetPanel(props: BodyProps & { className?: string }) {
  const content = useStoreHere(props);
  return <SheetPanel {...content} className={props.className} />;
}
