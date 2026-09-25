/**
 * Stand-in for U4's Store here sheet, typed by the shared contract so the
 * container page opens it exactly as it will open the real one. It shows
 * the two tabs and what each does; U4's sheet replaces it on integration.
 */
import { Button, Input, Label, Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { Sheet } from '../foundation';

import type { StoreHereSheetProps } from '../foundation';

/** The Store here sheet, stubbed to the contract. */
export function StoreHereSheetStub({
  open,
  onOpenChange,
  target,
  initialTab = 'new',
}: StoreHereSheetProps) {
  const refused = target.state === 'closed';
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Store in ${target.name}`}
      description={
        target.state === 'full'
          ? `${target.name} is marked full. You can still add to it.`
          : 'Add a new item straight into it, or put in things already recorded.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Done
          </Button>
          <Button disabled={refused}>Store</Button>
        </>
      }
    >
      <Tabs defaultValue={initialTab} className="gap-4">
        <TabsList>
          <TabsTrigger value="new">New item</TabsTrigger>
          <TabsTrigger value="existing">Already recorded</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="flex flex-col gap-1.5">
          <Label htmlFor="store-name">Name</Label>
          <Input id="store-name" placeholder="What are you putting in?" />
        </TabsContent>
        <TabsContent value="existing" className="text-sm text-muted-foreground">
          Search items and pick several; they move in together.
        </TabsContent>
      </Tabs>
    </Sheet>
  );
}
