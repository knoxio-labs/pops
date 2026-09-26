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

import type { ItemRowModel, PlacementWorld } from '../model';
import type { StoreHereTarget } from '../model/contracts';
import type { StoreCandidate } from './store-here-model';
import type { StoreHereState } from './store-here-view-content';

/** The controlled inputs and callbacks for the Store here sheet. */
export interface StoreHereViewProps {
  target: StoreHereTarget;
  world: PlacementWorld;
  /** Whether the owner's reads have loaded. */
  status: 'pending' | 'error' | 'success';
  /** Refetches what failed; called by the error banner's Retry. */
  onRetry: () => void;
  /** The Existing tab's rows, in the order shown. */
  candidates: readonly StoreCandidate[];
  initialTab?: 'new' | 'existing';
  query: string;
  onQuery: (query: string) => void;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** Names created here, newest first. */
  created: readonly string[];
  /** Resolves true when the item was created; the name field clears only then. */
  onCreate: (name: string) => Promise<boolean>;
  /** Shown under the name field; null for none. */
  createError: string | null;
  onStoreExisting: (items: readonly ItemRowModel[]) => void;
  onOpenTarget: () => void;
  onOpenForm: () => void;
  onDone: () => void;
  offline: boolean;
  /** A store or create is in flight. */
  busy: boolean;
}

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
