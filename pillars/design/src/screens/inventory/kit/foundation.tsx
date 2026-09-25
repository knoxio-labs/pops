import {
  creatingPlace,
  moveContainer,
  moveGaragePlace,
  previousDeleted,
  putBackTape,
} from '@/fixtures/inventory/placements';
import { BadgesGallery } from '@/kit/inventory/foundation-gallery/badges-gallery';
import { DragGallery } from '@/kit/inventory/foundation-gallery/drag-gallery';
import { BannersGallery, ToastsGallery } from '@/kit/inventory/foundation-gallery/feedback-gallery';
import { GalleryPage, Specimen } from '@/kit/inventory/foundation-gallery/gallery-frame';
import { PaletteGallery, PickerGallery } from '@/kit/inventory/foundation-gallery/overlays-gallery';
import { RowsGallery, TableGallery } from '@/kit/inventory/foundation-gallery/rows-gallery';
import { SelectionGallery } from '@/kit/inventory/foundation-gallery/selection-gallery';
import { MovePlanGallery, SheetGallery } from '@/kit/inventory/foundation-gallery/sheet-gallery';
import { ShortcutSheetBody } from '@/kit/inventory/shared/shortcut-sheet';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactNode } from 'react';

export const meta: ScreenMeta = { title: 'Foundation', order: 99, frame: 'web' };

function page(description: string, body: ReactNode): () => ReactNode {
  return function FoundationState() {
    return (
      <GalleryPage title="Inventory foundation" description={description}>
        {body}
      </GalleryPage>
    );
  };
}

/**
 * The shared inventory kit every unit builds on, one state per component
 * family: rows, badges, the selection bar, the palette, the placement
 * picker, the sheet, the move plan, toasts, banners, dragging and the
 * shortcut sheet. Each state is live: the selection, palette and picker
 * respond to the keyboard with the real models.
 */
const RowsState = page('The one row every list uses, in each state it can be in.', <RowsGallery />);

export const states: ScreenStates = {
  rows: RowsState,
  table: page('The same row model as a table.', <TableGallery />),
  badges: page('Every small signal, each with the word it travels with.', <BadgesGallery />),
  'selection-bar': page('Bulk verbs for whatever is selected.', <SelectionGallery />),
  palette: page('Cmd K, before anything is typed.', <PaletteGallery />),
  'palette-results': page('Cmd K, ranking a query.', <PaletteGallery specimen="results" />),
  'palette-argument': page(
    'Cmd K, running Move and asking where.',
    <PaletteGallery specimen="argument-step" />
  ),
  'palette-no-results': page('Cmd K, finding nothing.', <PaletteGallery specimen="no-results" />),
  'placement-picker': page(
    'The one placement picker.',
    <PickerGallery
      scenario={putBackTape}
      label="Put back"
      note="Tape measure came from the red toolbox."
    />
  ),
  'placement-picker-refusals': page(
    'The picker refusing what a move would refuse.',
    <PickerGallery
      scenario={moveContainer}
      label="Moving Cable tub"
      note="Its own contents cannot take it."
    />
  ),
  'placement-picker-deleted': page(
    'The picker when the previous place is gone.',
    <PickerGallery
      scenario={previousDeleted}
      label="Previous place deleted"
      note="Headphones were in Spare room."
    />
  ),
  'placement-picker-create': page(
    'The picker offering a place that does not exist yet.',
    <PickerGallery scenario={creatingPlace} label="New place" note="Typed inside Hallway." />
  ),
  'placement-picker-place': page(
    'The picker moving a place rather than an item.',
    <PickerGallery
      scenario={moveGaragePlace}
      label="Moving Workbench"
      note="Places only; never into itself."
    />
  ),
  sheet: page('The side sheet.', <SheetGallery />),
  'move-plan': page('What a bulk move will do, before it does it.', <MovePlanGallery />),
  toasts: page('Undo over confirm.', <ToastsGallery />),
  banners: page('When data is not simply fine.', <BannersGallery />),
  drag: page('Drag and drop placement, mid-drag.', <DragGallery />),
  'shortcut-sheet': page(
    'Every shortcut, read from the registry.',
    <Specimen label="Keyboard shortcuts" note="Opens with ?.">
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <ShortcutSheetBody />
      </div>
    </Specimen>
  ),
};

export default function FoundationScreen(): ReactNode {
  return <RowsState />;
}
