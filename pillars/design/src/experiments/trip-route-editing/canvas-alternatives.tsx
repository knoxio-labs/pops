import { GripVertical } from 'lucide-react';

import { SortableGrid, TextInput } from '@pops/ui';

import { reorderCards } from './canvas-actions';
import { canvasDragType, useCanvas } from './canvas-context';
import { CanvasInsert } from './canvas-insert';

import type { TripRecord } from '@/fixtures/trip-overview-model';
import type { ReactNode } from 'react';

import type { RouteSection } from './canvas-model';

type RenderRecord = (record: TripRecord, index: number) => ReactNode;

/** Alternative containers remain free-form editable and independently sortable. */
export function AlternativeGroups({
  gap,
  renderRecord,
}: {
  gap: TripRecord;
  renderRecord: RenderRecord;
}) {
  const { state, change } = useCanvas();
  const sections = state.sections.filter((s) => s.gapId === gap.id);
  return (
    <section
      aria-label="Alternative sections"
      data-canvas-id={gap.id}
      className="space-y-4 rounded-xl border border-dashed p-4"
    >
      <h2 className="font-semibold">Alternatives</h2>
      <SortableGrid
        items={sections}
        getKey={(s) => s.id}
        columnsClassName="grid-cols-1"
        onReorder={(next) =>
          change({
            ...state,
            sections: [...state.sections.filter((s) => s.gapId !== gap.id), ...next],
          })
        }
        renderItem={(section) => (
          <AlternativeSection sectionId={section.id} renderRecord={renderRecord} />
        )}
      />
      <CanvasInsert
        defaultKind="section"
        label="Add alternative section"
        target={{ gapId: gap.id }}
      />
    </section>
  );
}

function AlternativeSection({
  sectionId,
  renderRecord,
}: {
  sectionId: string;
  renderRecord: RenderRecord;
}) {
  const canvas = useCanvas();
  const { state, change } = canvas;
  const section = state.sections.find((s) => s.id === sectionId);
  if (!section) return null;
  const records = section.cards.flatMap((id) => state.records.filter((r) => r.id === id));
  return (
    <div
      data-canvas-id={section.id}
      className="group/section space-y-3 rounded-xl border border-dashed bg-muted/20 p-3"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(canvasDragType)) return;
        e.preventDefault();
        e.stopPropagation();
        canvas.setHoverVisit(null);
      }}
      onDrop={(event) => {
        const id = event.dataTransfer.getData(canvasDragType);
        if (!id) return;
        event.preventDefault();
        event.stopPropagation();
        canvas.move(id, { sectionId: section.id });
      }}
    >
      <AlternativeHeader section={section} />

      <SortableGrid
        items={records}
        getKey={(r) => r.id}
        columnsClassName="grid-cols-1"
        onReorder={(next) =>
          change(
            reorderCards(
              state,
              next.map((r) => r.id),
              section.id
            )
          )
        }
        renderItem={renderRecord}
      />
      <CanvasInsert label={`Add to ${section.title}`} target={{ sectionId: section.id }} />
    </div>
  );
}

function AlternativeHeader({ section }: { section: RouteSection }) {
  const { state, change } = useCanvas();
  return (
    <div className="flex items-center gap-2">
      <GripVertical
        className="size-4 cursor-grab opacity-0 group-hover/section:opacity-100"
        aria-hidden
      />
      <TextInput
        aria-label="Section name"
        variant="ghost"
        defaultValue={section.title}
        onBlur={(e) =>
          change({
            ...state,
            sections: state.sections.map((s) =>
              s.id === section.id ? { ...s, title: e.target.value } : s
            ),
          })
        }
      />
    </div>
  );
}
