/**
 * Store here: create new items directly in a container or place, or search
 * and select existing items to move there. The owner supplies reads and
 * callbacks; this view owns only the name currently being typed.
 */
import { useState } from 'react';

import { Sheet, SheetPanel } from '@pops/ui';

import { targetNotice } from './store-here-model';
import { StoreHereBody, StoreHereFooter } from './store-here-view-content';

import type { ReactElement } from 'react';

import type { SheetContentProps } from '@pops/ui';

import type { StoreHereState, StoreHereViewProps } from './store-here-view-content';

export type { StoreHereViewProps } from './store-here-view-content';

type BodyProps = StoreHereViewProps;

function useStoreState(
  props: BodyProps,
  disabled: boolean,
  createDisabled: boolean
): StoreHereState {
  const [tab, setTab] = useState<'new' | 'existing'>(props.initialTab ?? 'new');
  const [name, setName] = useState('');
  const create = (): void => {
    const trimmed = name.trim();
    if (trimmed === '' || disabled || createDisabled) return;
    void props
      .onCreate(trimmed)
      .then((created) => {
        if (created) setName('');
      })
      .catch(() => undefined);
  };
  return { tab, setTab, name, setName, create };
}

function useStoreHere(props: BodyProps): SheetContentProps {
  const targetNoticeValue = targetNotice(props.world, props.target);
  const notice = props.status === 'success' ? targetNoticeValue : null;
  const disabled = targetNoticeValue?.tone === 'refuse' || props.offline;
  const createDisabled = props.busy || props.status !== 'success';
  const state = useStoreState(props, disabled, createDisabled);
  const noun = props.target.kind === 'container' ? 'container' : 'place';
  return {
    title: `Store in ${props.target.name}`,
    description: `Create items straight into this ${noun}, or bring in ones you already have.`,
    children: (
      <StoreHereBody
        props={props}
        state={state}
        disabled={disabled}
        createDisabled={createDisabled}
        notice={notice}
      />
    ),
    footer: (
      <StoreHereFooter
        props={props}
        state={state}
        disabled={disabled}
        createDisabled={createDisabled}
      />
    ),
  };
}

/** Renders the controlled Store here sheet over the current page. */
export function StoreHereSheetView(
  props: StoreHereViewProps & { open: boolean; onOpenChange: (open: boolean) => void }
): ReactElement {
  const { open, onOpenChange, ...viewProps } = props;
  const content = useStoreHere(viewProps);
  return <Sheet open={open} onOpenChange={onOpenChange} {...content} />;
}

/** Renders the controlled Store here content in a review or story panel. */
export function StoreHereSheetPanel(
  props: StoreHereViewProps & { className?: string }
): ReactElement {
  const { className, ...viewProps } = props;
  const content = useStoreHere(viewProps);
  return <SheetPanel {...content} className={className} />;
}
