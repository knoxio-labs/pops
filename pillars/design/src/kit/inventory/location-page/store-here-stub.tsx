/**
 * A stand-in for U4's Store here sheet, built to the shared contract
 * (`StoreHereSheetProps`) so the entry points here open the right thing
 * with the right target. The integrator swaps this for the real sheet; the
 * props do not change.
 */
import { useState } from 'react';

import { Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { INVENTORY_ICONS, ItemRow, Sheet } from '../foundation';

import type { StoreHereSheetProps } from '../foundation';

function NewTab({ onCreate }: Pick<StoreHereSheetProps, 'onCreate'>) {
  const [name, setName] = useState('');
  return (
    <div className="space-y-2">
      <Input
        aria-label="Name of the new item"
        placeholder="What are you putting here?"
        value={name}
        onChange={(event) => setName(event.target.value)}
      />
      <Button
        className="w-full"
        disabled={name.trim() === ''}
        onClick={() => {
          onCreate?.(name.trim());
          setName('');
        }}
      >
        Add and store another
      </Button>
    </div>
  );
}

/** The stub sheet: New and Existing tabs, In hand offered first under Existing. */
export function StoreHereStub(props: StoreHereSheetProps) {
  const inHand = [...props.world.items.values()].filter(
    (entry) => entry.placement.kind === 'in-hand' && entry.lifecycle === 'active'
  );
  return (
    <Sheet
      open={props.open}
      onOpenChange={props.onOpenChange}
      title={`Store in ${props.target.name}`}
      description="Add something new here, or put existing things here."
    >
      <Tabs defaultValue={props.initialTab ?? 'new'}>
        <TabsList className="mb-3 w-full">
          <TabsTrigger value="new">New</TabsTrigger>
          <TabsTrigger value="existing">Existing</TabsTrigger>
        </TabsList>
        <TabsContent value="new">
          <NewTab onCreate={props.onCreate} />
        </TabsContent>
        <TabsContent value="existing" className="space-y-2">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <INVENTORY_ICONS.inHand className="size-3.5" aria-hidden />
            In hand now
          </p>
          <div role="grid" aria-label="In hand" className="divide-y rounded-lg border">
            {inHand.map((entry) => (
              <ItemRow key={entry.id} item={entry} world={props.world} showPlacement={false} />
            ))}
          </div>
          <Button className="w-full" onClick={() => props.onStoreExisting?.(inHand)}>
            Store {inHand.length} here
          </Button>
        </TabsContent>
      </Tabs>
    </Sheet>
  );
}
