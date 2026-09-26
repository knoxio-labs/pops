import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { StateBanner } from '../feedback/state-banner';
import { ExistingTab } from './existing-tab';
import { NewTab } from './new-tab';
import { carriedLine, storeButtonLabel, storePlan } from './store-here-model';

import type { TargetNotice } from './store-here-model';
import type { StoreHereViewProps } from './store-here-view';

/** State kept by the view for the active tab and the name being typed. */
export interface StoreHereState {
  tab: 'new' | 'existing';
  setTab: (tab: 'new' | 'existing') => void;
  name: string;
  setName: (name: string) => void;
  create: () => void;
}

/** Inputs shared by the Store here body and footer. */
export interface StoreHereBodyProps {
  props: StoreHereViewProps;
  state: StoreHereState;
  disabled: boolean;
  createDisabled: boolean;
  notice: TargetNotice;
}

function Notices({ props, notice }: Pick<StoreHereBodyProps, 'props' | 'notice'>) {
  if (props.status === 'error') {
    return (
      <StateBanner
        kind="error"
        title="Could not load items."
        actionLabel="Retry"
        onAction={props.onRetry}
      />
    );
  }
  if (props.status !== 'success') return null;

  return (
    <>
      {props.offline ? (
        <StateBanner
          kind="offline"
          title="No connection. Nothing can be stored until it returns."
        />
      ) : null}
      {notice === null ? null : (
        <StateBanner
          kind={notice.tone === 'refuse' ? 'needs-attention' : 'stale'}
          title={notice.text}
          actionLabel={notice.tone === 'refuse' ? `Open ${props.target.name}` : undefined}
          onAction={notice.tone === 'refuse' ? props.onOpenTarget : undefined}
        />
      )}
    </>
  );
}

/** Renders the Store here tabs and notices. */
export function StoreHereBody({
  props,
  state,
  disabled,
  createDisabled,
  notice,
}: StoreHereBodyProps) {
  const { target, world } = props;
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <Notices props={props} notice={notice} />
      <Tabs
        value={state.tab}
        className="flex min-h-0 flex-1 flex-col"
        onValueChange={(value) => state.setTab(value === 'existing' ? 'existing' : 'new')}
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
            createDisabled={createDisabled}
            created={props.created}
            onCreate={state.create}
            onOpenForm={props.onOpenForm}
            error={props.createError}
          />
        </TabsContent>
        <TabsContent value="existing" className="min-h-0 flex-1 pt-3">
          <ExistingTab
            world={world}
            query={props.query}
            onQuery={props.onQuery}
            candidates={props.candidates}
            selected={props.selected}
            onToggle={props.onToggle}
            disabled={disabled}
            status={props.status}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/** Renders the tab-dependent footer actions and move-plan copy. */
export function StoreHereFooter({
  props,
  state,
  disabled,
  createDisabled,
}: Omit<StoreHereBodyProps, 'notice'>) {
  if (state.tab === 'new') {
    return (
      <Button variant="outline" size="sm" onClick={props.onDone}>
        Done
      </Button>
    );
  }
  const plan = storePlan(props.world, props.target, [...props.selected]);
  const storeDisabled =
    disabled || createDisabled || props.status !== 'success' || plan.moving.length === 0;
  return (
    <>
      <p className="mr-auto min-w-0 text-xs text-muted-foreground">{carriedLine(plan)}</p>
      <Button variant="ghost" size="sm" onClick={props.onDone}>
        Done
      </Button>
      <Button size="sm" disabled={storeDisabled} onClick={() => props.onStoreExisting(plan.moving)}>
        {storeButtonLabel(plan)}
      </Button>
    </>
  );
}
