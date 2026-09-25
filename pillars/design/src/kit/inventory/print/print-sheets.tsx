import { A4_HEIGHT_MM, A4_WIDTH_MM, slotOrigin } from '@pops/inventory/labels';
/**
 * The job drawn on its sheets at true size. On screen the sheets are scaled
 * down with `zoom` and show each die-cut, the labels already peeled off the
 * first sheet, and the blanks left on the last; on paper only the labels
 * print. The first sheet doubles as the start picker: choosing any of its
 * labels starts the job there.
 */
import { cn } from '@pops/ui';

import { ContentLabel } from './label-templates';
import { PRINT_ROOT_CLASS, PRINT_SHEET_CLASS } from './print-styles';

import type { SheetLayout, SheetPage, SheetSlot } from '@pops/inventory/labels';

import type { PrintLabelEntry } from './use-print-job';

/** Props for {@link PrintSheets}. */
export interface PrintSheetsProps {
  pages: SheetPage[];
  labels: PrintLabelEntry[];
  layout: SheetLayout;
  /** Called with a 1-based label number when a first-sheet label is chosen as the start. */
  onStartAt: (startAt: number) => void;
  /** Renders the preview the way a black and white printer will. */
  monochrome?: boolean;
}

interface SlotProps {
  slot: SheetSlot;
  props: PrintSheetsProps;
  firstPage: boolean;
}

function SlotContent({ slot, props }: SlotProps) {
  if (slot.kind === 'used') {
    return (
      <div className="flex h-full items-center justify-center bg-[repeating-linear-gradient(135deg,var(--color-print-tint)_0_6px,transparent_6px_12px)] text-[9pt] font-medium text-print-rule-strong print:hidden">
        Used
      </div>
    );
  }
  if (slot.kind === 'blank') return null;
  const entry = props.labels[slot.label];
  if (!entry) return null;
  return <ContentLabel label={entry.label} subject={entry.subject} layout={props.layout} />;
}

function Slot({ slot, props, firstPage }: SlotProps) {
  const { layout } = props;
  const origin = slotOrigin(layout, slot.slot);
  const number = slot.slot + 1;
  return (
    <div
      className="absolute ring-1 ring-print-rule ring-inset print:ring-0"
      style={{
        left: `${origin.xMm}mm`,
        top: `${origin.yMm}mm`,
        width: `${layout.labelWidthMm}mm`,
        height: `${layout.labelHeightMm}mm`,
        borderRadius: `${layout.cornerMm}mm`,
      }}
      data-slot-kind={slot.kind}
    >
      <SlotContent slot={slot} props={props} firstPage={firstPage} />
      {firstPage ? (
        <button
          type="button"
          aria-label={`Start at label ${number}`}
          onClick={() => props.onStartAt(number)}
          className="absolute inset-0 min-h-11 min-w-11 rounded-[inherit] outline-none hover:ring-2 hover:ring-app-accent/60 focus-visible:ring-3 focus-visible:ring-app-accent print:hidden"
        />
      ) : null}
    </div>
  );
}

function Sheet({
  page,
  total,
  props,
}: {
  page: SheetPage;
  total: number;
  props: PrintSheetsProps;
}) {
  return (
    <section
      aria-label={`Sheet ${page.page + 1} of ${total}`}
      className={cn(
        PRINT_SHEET_CLASS,
        'relative shrink-0 overflow-hidden bg-qr-quiet-zone text-print-ink shadow-md ring-1 ring-border'
      )}
      style={{ width: `${A4_WIDTH_MM}mm`, height: `${A4_HEIGHT_MM}mm` }}
    >
      {page.slots.map((slot) => (
        <Slot key={slot.slot} slot={slot} props={props} firstPage={page.page === 0} />
      ))}
    </section>
  );
}

/**
 * Every sheet of the job. The paper is white and the ink black whatever the
 * screen theme, for the same reason the QR tokens are theme-invariant.
 */
export function PrintSheets(props: PrintSheetsProps) {
  const { pages, monochrome = false } = props;
  return (
    <div
      className={cn(
        PRINT_ROOT_CLASS,
        'flex flex-col items-center gap-10 [zoom:0.38] sm:[zoom:0.55] lg:[zoom:0.42] xl:[zoom:0.68] 2xl:[zoom:0.8]',
        monochrome && 'grayscale'
      )}
    >
      {pages.map((page) => (
        <Sheet key={page.page} page={page} total={pages.length} props={props} />
      ))}
    </div>
  );
}
