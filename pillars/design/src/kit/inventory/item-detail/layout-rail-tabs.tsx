/**
 * E1 variant `rail-tabs`: a fixed facts rail (photo and every fact) beside
 * tabs for the rest: Overview (provenance and documents), Connections and
 * History, keyed 1 2 3. Below the split width the rail folds into a first
 * Facts tab, so tablet keeps one pane.
 */
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@pops/ui';

import { ShortcutHint } from '../foundation';
import { FactsSection } from './facts-section';
import { PhotosSection } from './photos-section';
import { PaneLabel } from './section-parts';

import type { DetailSectionId } from './detail-model';
import type { DetailBodyProps } from './layout-types';
import type { SectionSpec } from './sections';

function Rail({ model, condition, readOnly, onQuantity }: DetailBodyProps) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <PhotosSection
        photos={model.photos}
        itemName={model.item.name}
        broken={condition.brokenPhoto}
        size="wide"
        disabledReason={readOnly ? 'Nothing can change on this item.' : undefined}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <FactsSection
          facts={model.facts}
          typeName={model.item.typeName}
          condition={condition}
          layout="list"
          readOnly={readOnly}
          onQuantity={onQuantity}
        />
      </div>
    </div>
  );
}

function tabOf(id: DetailSectionId | undefined): string {
  if (id === 'connections' || id === 'history') return id;
  return 'overview';
}

function Trigger({
  value,
  label,
  count,
  keyId,
}: {
  value: string;
  label: string;
  count?: number | null;
  keyId: string;
}) {
  return (
    <TabsTrigger value={value} className="group/tab gap-1.5">
      {label}
      {count ? <span className="text-xs tabular-nums text-muted-foreground">{count}</span> : null}
      <ShortcutHint
        id={keyId}
        className="opacity-0 transition-opacity group-hover/tab:opacity-100 group-focus-visible/tab:opacity-100"
      />
    </TabsTrigger>
  );
}

function Pane({ spec }: { spec: SectionSpec | undefined }) {
  if (spec === undefined) return null;
  return (
    <section aria-label={spec.title} className="flex flex-col gap-1">
      <PaneLabel>{spec.title}</PaneLabel>
      {spec.body}
    </section>
  );
}

/** The rail and tabs body. */
export function RailTabsBody(props: DetailBodyProps) {
  const find = (id: DetailSectionId) => props.sections.find((spec) => spec.id === id);
  const connections = find('connections');
  const history = find('history');
  const content = 'min-h-0 flex-1 overflow-y-auto px-4 py-3 @container';
  return (
    <div className="flex min-h-0 flex-1 gap-5">
      <aside
        aria-label="Facts"
        className="hidden w-72 shrink-0 flex-col rounded-xl border bg-card p-4 @2xl:flex @4xl:w-80"
      >
        <Rail {...props} />
      </aside>
      <Tabs
        defaultValue={tabOf(props.condition.openSection)}
        className="flex min-h-0 min-w-0 flex-1 flex-col gap-0 rounded-xl border bg-card"
      >
        <TabsList variant="line" className="shrink-0 border-b px-2">
          <TabsTrigger value="facts" className="@2xl:hidden">
            Facts
          </TabsTrigger>
          <Trigger value="overview" label="Overview" keyId="detail-tab-1" />
          <Trigger
            value="connections"
            label="Connections"
            count={connections?.count}
            keyId="detail-tab-2"
          />
          <Trigger value="history" label="History" count={history?.count} keyId="detail-tab-3" />
        </TabsList>
        <TabsContent value="facts" className={content}>
          <Rail {...props} />
        </TabsContent>
        <TabsContent value="overview" className={`${content} flex flex-col gap-5`}>
          <Pane spec={find('provenance')} />
          <Pane spec={find('documents')} />
        </TabsContent>
        <TabsContent value="connections" className={content}>
          {connections?.body}
        </TabsContent>
        <TabsContent value="history" className={content}>
          {history?.body}
        </TabsContent>
      </Tabs>
    </div>
  );
}
