import { PopsPhoto } from '@/frames/ios/fields';
import { IosSectionHeader } from '@/kit/ios-controls';
import { RECEIPT_COPY } from '@/kit/ios-receipt-copy';
import { FileText } from 'lucide-react';

/**
 * The pages strip: what the reader actually photographed, above whatever the
 * pillar made of it. It is the constant on every outcome — the answer changes,
 * the evidence does not — so a reading that looks wrong can be checked against
 * the paper without leaving the screen.
 *
 * Horizontal even for a single page. One page and five pages laid out
 * differently would be two designs, and the second one only appears on a long
 * receipt, which is exactly when a reader is least able to tell what changed.
 */
const BARS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id, index) => ({
  id,
  width: [0.9, 0.55, 0.75, 0.4, 0.85, 0.6, 0.7, 0.35][index] ?? 0.6,
}));

/**
 * A page as a photo of till paper: pale stock, dark print, no real asset.
 *
 * The two colours here are deliberately not tokens and deliberately do not
 * follow the theme. This is standing in for a photograph, and a receipt
 * photographed in the dark is still printed on beige paper — a page plate
 * that inverted with the app would be the one thing on screen lying about
 * what the camera saw.
 */
function PaperPage({ label }: { label: string }) {
  return (
    <PopsPhoto glyph={<FileText size={28} />} label={label}>
      <span
        className="flex h-full w-full flex-col justify-center gap-2 px-3"
        style={{ background: 'rgb(245 243 235)' }}
      >
        {BARS.map((bar) => (
          <span
            key={bar.id}
            className="h-1.5 rounded-full"
            style={{ width: `${bar.width * 100}%`, background: 'rgb(64 61 56)' }}
          />
        ))}
      </span>
    </PopsPhoto>
  );
}

export function ReceiptPages({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <section className="space-y-2">
      <IosSectionHeader>{RECEIPT_COPY.photographed}</IosSectionHeader>
      <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-1">
        {Array.from({ length: count }, (_, index) => index + 1).map((page) => (
          <PaperPage
            key={page}
            label={count === 1 ? 'Photo of the receipt' : `Photo ${page} of ${count}`}
          />
        ))}
      </div>
    </section>
  );
}
