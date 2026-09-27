import { createElement as h } from 'react';

import * as ui from '@pops/ui';

import { ShortcutHint } from '../../foundation/shortcuts/shortcut-hint.js';
import { useShortcutScope } from '../../foundation/shortcuts/shortcut-provider.js';
import * as dialogOptions from './connect-dialog-options.js';
import * as refusal from './connect-refusal.js';

import type { ReactNode } from 'react';

function useConnectModel(onOpenChange: (open: boolean) => void) {
  const draft = dialogOptions.useConnectDraft();
  const reads = dialogOptions.useConnectReads(draft);
  const { leftItems, rightItems, fixtures, connections, mutations } = reads;
  const from = refusal.resolveCandidate(draft.fromKey, 'item', leftItems.rows, leftItems.rows);
  const right = draft.toKind === 'item' ? rightItems : fixtures;
  const to =
    draft.toKind === 'item'
      ? refusal.resolveCandidate(draft.toKey, 'item', rightItems.rows, rightItems.rows)
      : refusal.resolveCandidate(draft.toKey, 'fixture', fixtures.rows);
  const places = refusal.placementStatus(reads.placement);
  let refusalText: string | null = null;
  if (from?.item !== undefined && to?.end !== null && to?.end !== undefined)
    refusalText = refusal.connectRefusal(
      from.item,
      { end: to.end, name: to.name, item: to.item },
      connections.rows
    );
  const verdict = refusal.connectVerdict({
    from,
    to,
    status: connections.status,
    refusal: refusalText,
    failure: draft.failure,
  });
  const close = () => {
    draft.reset();
    onOpenChange(false);
  };
  const connect = () =>
    void refusal.connectAction({
      canConnect: verdict.ok,
      result: verdict,
      connectItems: mutations.connectItems,
      connectFixture: mutations.connectFixture,
      update: draft.update,
      close,
    });
  const retry = (side: 'left' | 'right') =>
    reads.retry({
      side,
      kind: side === 'left' ? 'item' : draft.toKind,
      candidate: side === 'left' ? reads.leftItems.status : right.status,
      places,
    });
  useShortcutScope('form', { 'form-save': () => (verdict.ok ? (connect(), true) : false) });
  return {
    draft,
    options: dialogOptions.connectOptions(reads, from),
    verdict,
    leftStatus: refusal.statusFor(leftItems.status, places),
    rightStatus: refusal.statusFor(right.status, places, connections.status),
    leftWhat: refusal.failedWhat(leftItems.status, 'item', places),
    rightWhat: refusal.failedWhat(right.status, draft.toKind, places),
    retry,
    connect,
  };
}

type CandidateListProps = Record<'label' | 'what', string> & {
  options: readonly dialogOptions.PickOption[];
  status: refusal.ReadStatus;
  retry: () => void;
  pick: (key: string) => void;
};

const loadingRows = h(
  'div',
  { 'aria-label': 'Loading' },
  [1, 2, 3].map((row) =>
    h('div', { key: row, className: 'h-10 animate-pulse rounded-md bg-muted' })
  )
);
const failedRows = (what: string, retry: () => void): ReactNode =>
  h(
    'div',
    null,
    `${what} did not load`,
    h(ui.ButtonPrimitive, { type: 'button', onClick: retry }, 'Retry')
  );
function optionElement(option: dialogOptions.PickOption, pick: (key: string) => void): ReactNode {
  return h(
    'button',
    {
      key: option.key,
      type: 'button',
      role: 'option',
      'aria-disabled': option.refusal !== undefined,
      onClick: () => option.refusal === undefined && pick(option.key),
    },
    option.mark,
    `${option.title} ${option.refusal ?? ''}`,
    option.meta
  );
}

function CandidateList({ label, options, status, what, retry, pick }: CandidateListProps) {
  const list = (children: ReactNode) =>
    h('div', { role: 'listbox', 'aria-label': label }, children);
  if (status === 'pending') return list(loadingRows);
  if (status === 'error') return list(failedRows(what, retry));
  if (options.length === 0) return list(h('p', null, 'Nothing matches.'));
  return list(options.map((option) => optionElement(option, pick)));
}

type ConnectModel = ReturnType<typeof useConnectModel>;

function Picker({ model, side }: { model: ConnectModel; side: 'left' | 'right' }) {
  const left = side === 'left';
  let options = model.options.rightFixtureOptions;
  if (left) options = model.options.fromOptions;
  else if (model.draft.toKind === 'item') options = model.options.rightItemOptions;
  const label = left ? 'Item' : 'Connects to';
  const query = left ? model.draft.fromQuery : model.draft.toQuery;
  const placeholder =
    !left && model.draft.toKind === 'fixture'
      ? 'Find a fixture by name, note or wired item'
      : 'Search items';
  const status = left ? model.leftStatus : model.rightStatus;
  const what = left ? model.leftWhat : model.rightWhat;
  return h(
    'section',
    null,
    h('label', { htmlFor: `connect-${label}` }, label),
    h(ui.Input, {
      id: `connect-${label}`,
      'aria-label': placeholder,
      placeholder,
      value: query,
      onChange: (event) =>
        model.draft.update(
          left ? { fromQuery: event.target.value } : { toQuery: event.target.value }
        ),
    }),
    h(CandidateList, {
      label,
      options,
      status,
      what,
      retry: () => model.retry(side),
      pick: (key: string) => model.draft.update(left ? { fromKey: key } : { toKey: key }),
    })
  );
}

function ConnectBody({ model, close }: { model: ConnectModel; close: (open: boolean) => void }) {
  const changeKind = (value: string) =>
    model.draft.update({
      toKind: value === 'fixture' ? 'fixture' : 'item',
      toKey: null,
      toQuery: '',
    });
  const tabs = h(
    ui.Tabs,
    { value: model.draft.toKind, onValueChange: changeKind },
    h(
      ui.TabsList,
      null,
      h(ui.TabsTrigger, { value: 'item' }, 'Item'),
      h(ui.TabsTrigger, { value: 'fixture' }, 'Fixture')
    )
  );
  const footer = h(
    ui.DialogFooter,
    null,
    h('p', { role: 'status' }, model.verdict.text),
    h(
      ui.ButtonPrimitive,
      { type: 'button', variant: 'outline', onClick: () => close(false) },
      'Cancel'
    ),
    h(
      ui.ButtonPrimitive,
      {
        type: 'button',
        disabled: !model.verdict.ok || model.draft.isConnecting,
        onClick: model.connect,
      },
      model.draft.isConnecting ? 'Connecting…' : 'Connect',
      h(ShortcutHint, { id: 'form-save' })
    )
  );
  return h(
    ui.DialogContent,
    null,
    h(ui.DialogTitle, null, 'Connect ends'),
    h('div', null, h(Picker, { model, side: 'left' }), tabs, h(Picker, { model, side: 'right' })),
    footer
  );
}

/** Props for the inventory web connection-end dialog. */
export type ConnectEndsDialogProps = { open: boolean; onOpenChange: (open: boolean) => void };

/** Selects an item and an item or fixture, then connects the two endpoints. */
export function ConnectEndsDialog({ open, onOpenChange }: ConnectEndsDialogProps) {
  const model = useConnectModel(onOpenChange);
  const close = (nextOpen: boolean) => {
    if (!nextOpen) model.draft.reset();
    onOpenChange(nextOpen);
  };
  return h(ui.Dialog, { open, onOpenChange: close }, h(ConnectBody, { model, close }));
}
