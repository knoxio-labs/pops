import { ShortcutHint } from '@/kit/inventory/foundation';
import { PickList } from '@/kit/inventory/secondary-page/pick-list';
/**
 * Connect: an item on the left, what it connects to on the right (another
 * item or a fixture), and one sentence under both saying what will happen or
 * why it cannot. Pairs that already exist stay listed with that reason.
 */
import { useState } from 'react';

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@pops/ui';

import { endFromKey, firstEndOptions, secondEndOptions } from './connect-dialog-options';
import { connectRefusal } from './connection-model';

import type { ConnectionModel } from '@/kit/inventory/fixtures/fixture-model';

import type { ConnectionIndex } from './connection-model';

/** Where the dialog opens: chosen ends and queries, for review states. */
export interface ConnectSeed {
  fromKey?: string;
  toKind?: 'item' | 'fixture';
  toKey?: string;
  fromQuery?: string;
  toQuery?: string;
}

/** Props for {@link ConnectEndsDialog}. */
export interface ConnectEndsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  index: ConnectionIndex;
  connections: readonly ConnectionModel[];
  seed?: ConnectSeed;
  onConnect?: (itemId: string, toKey: string) => void;
}

function outcome(fromKey: string | null, toKey: string | null, props: ConnectEndsDialogProps) {
  const from = endFromKey(fromKey);
  const to = endFromKey(toKey);
  if (from?.kind !== 'item' || to === null) return { ok: false, text: 'Choose both ends.' };
  const refusal = connectRefusal(from.itemId, to, props.connections, props.index);
  if (refusal !== null) return { ok: false, text: refusal };
  const name = (key: string) =>
    key.startsWith('item:')
      ? props.index.world.items.get(key.slice(5))?.name
      : props.index.fixtures.get(key.slice(8))?.name;
  return { ok: true, text: `${name(fromKey ?? '')} will be connected to ${name(toKey ?? '')}.` };
}

const keySet = (key: string | null): ReadonlySet<string> => new Set(key === null ? [] : [key]);

function useConnectDraft(seed: ConnectSeed) {
  const [fromKey, setFromKey] = useState<string | null>(seed.fromKey ?? null);
  const [toKind, setToKind] = useState<'item' | 'fixture'>(seed.toKind ?? 'item');
  const [toKey, setToKey] = useState<string | null>(seed.toKey ?? null);
  const [fromQuery, setFromQuery] = useState(seed.fromQuery ?? '');
  const [toQuery, setToQuery] = useState(seed.toQuery ?? '');
  return {
    fromKey,
    setFromKey,
    toKind,
    setToKind,
    toKey,
    setToKey,
    fromQuery,
    setFromQuery,
    toQuery,
    setToQuery,
  };
}

type ConnectDraft = ReturnType<typeof useConnectDraft>;

function SecondEnd({ draft, props }: { draft: ConnectDraft; props: ConnectEndsDialogProps }) {
  const from = endFromKey(draft.fromKey);
  const options = secondEndOptions({
    kind: draft.toKind,
    query: draft.toQuery,
    fromId: from?.kind === 'item' ? from.itemId : null,
    connections: props.connections,
    index: props.index,
  });
  return (
    <section className="flex min-h-0 flex-col gap-2" aria-label="Connects to">
      <div className="flex h-9 items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Connects to</h3>
        <Tabs
          value={draft.toKind}
          onValueChange={(value) => {
            draft.setToKind(value === 'fixture' ? 'fixture' : 'item');
            draft.setToKey(null);
          }}
        >
          <TabsList aria-label="Connects to">
            <TabsTrigger value="item">Item</TabsTrigger>
            <TabsTrigger value="fixture">Fixture</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <PickList
        label="Connects to"
        options={options}
        selected={keySet(draft.toKey)}
        query={draft.toQuery}
        placeholder={
          draft.toKind === 'item'
            ? 'Find an item by name or code'
            : 'Find a fixture by name or kind'
        }
        onQueryChange={draft.setToQuery}
        onToggle={draft.setToKey}
      />
    </section>
  );
}

function Footer({ draft, props }: { draft: ConnectDraft; props: ConnectEndsDialogProps }) {
  const verdict = outcome(draft.fromKey, draft.toKey, props);
  const from = endFromKey(draft.fromKey);
  const connect = () => {
    if (verdict.ok && from?.kind === 'item' && draft.toKey !== null)
      props.onConnect?.(from.itemId, draft.toKey);
  };
  return (
    <DialogFooter className="items-center gap-3 sm:justify-between">
      <p role="status" className={verdict.ok ? 'text-sm' : 'text-sm text-muted-foreground'}>
        {verdict.text}
      </p>
      <div className="flex gap-2">
        <Button variant="outline" onClick={() => props.onOpenChange(false)}>
          Cancel
        </Button>
        <Button
          disabled={!verdict.ok}
          suffix={<ShortcutHint id="form-save" onPrimary />}
          onClick={connect}
        >
          Connect
        </Button>
      </div>
    </DialogFooter>
  );
}

/** The connect dialog. */
export function ConnectEndsDialog(props: ConnectEndsDialogProps) {
  const draft = useConnectDraft(props.seed ?? {});
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="flex h-[min(40rem,90dvh)] flex-col gap-4 md:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Connect</DialogTitle>
          <DialogDescription>
            Pick an item, then the item or fixture it plugs into, feeds or pairs with.
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 grid-cols-2 gap-4">
          <section className="flex min-h-0 flex-col gap-2" aria-label="Item">
            <h3 className="flex h-9 items-center text-sm font-medium">Item</h3>
            <PickList
              label="Item"
              options={firstEndOptions(draft.fromQuery, props.index)}
              selected={keySet(draft.fromKey)}
              query={draft.fromQuery}
              placeholder="Find an item by name or code"
              onQueryChange={draft.setFromQuery}
              onToggle={draft.setFromKey}
            />
          </section>
          <SecondEnd draft={draft} props={props} />
        </div>
        <Footer draft={draft} props={props} />
      </DialogContent>
    </Dialog>
  );
}
