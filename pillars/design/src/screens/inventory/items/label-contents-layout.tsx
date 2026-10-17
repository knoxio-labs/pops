import { labelContents, shortLabelContents } from '@/fixtures/inventory/label-contents-layout';

import { FieldIcon, QrCode } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { ReactElement } from 'react';

const LABEL_WIDTH = '99.1mm';
const LABEL_HEIGHT = '139mm';
const QR_SIZE = '32mm';
const TWO_COLUMN_MINIMUM = 9;

interface LabelContentsPreviewProps {
  columns: 1 | 2;
  contents: readonly string[];
  fragile?: boolean;
}

function contentColumnCount(columns: 1 | 2, itemCount: number): 1 | 2 {
  return columns === 2 && itemCount >= TWO_COLUMN_MINIMUM ? 2 : 1;
}

function splitContents(
  contents: readonly string[],
  columns: 1 | 2
): readonly (readonly string[])[] {
  if (columns === 1) return [contents];

  const splitAt = Math.ceil(contents.length / 2);
  return [contents.slice(0, splitAt), contents.slice(splitAt)];
}

function FragileMark(): ReactElement {
  return (
    <svg
      viewBox="0 0 64 64"
      className="size-full"
      fill="none"
      stroke="currentColor"
      strokeWidth={4}
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label="Fragile: cracked glass"
    >
      <path d="M18 5h28l3 18c2 11-6 20-17 20s-19-9-17-20L18 5Z" />
      <path d="m35 5-8 13 10 7-9 10 4 8M32 43v16M21 59h22" />
    </svg>
  );
}

function LabelIdentity(): ReactElement {
  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
      <h1 className="break-words text-2xl leading-tight font-bold text-print-ink">Books 2</h1>
      <dl className="space-y-1.5 text-sm leading-tight">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <dt className="font-medium">Destination:</dt>
          <dd className="font-semibold">Storage</dd>
        </div>
        <div>
          <dt className="sr-only">Unpack in</dt>
          <dd className="flex items-center gap-1.5 font-semibold">
            <FieldIcon name="PackageOpenUp" />
            Office
          </dd>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <dt className="font-medium">Stackable:</dt>
          <dd className="font-semibold">Yes</dd>
        </div>
      </dl>
    </div>
  );
}

function LabelHeader({ fragile }: { fragile: boolean }): ReactElement {
  const symbolSize = fragile ? '24mm' : QR_SIZE;
  return (
    <header className="flex shrink-0 items-start gap-3 border-b border-print-rule pb-4">
      <div className="shrink-0" style={{ width: symbolSize, height: symbolSize }}>
        <QrCode
          value="pops://inventory/item/550e8400-e29b-41d4-a716-446655440000"
          title="Open Books 2 in inventory"
          className="max-w-none"
        />
      </div>
      <LabelIdentity />
      {fragile ? (
        <div className="shrink-0" style={{ width: symbolSize, height: symbolSize }}>
          <FragileMark />
        </div>
      ) : null}
    </header>
  );
}

/** Previews the physical label, with an optional warning matching the QR's dimensions. */
export function LabelContentsPreview({
  columns,
  contents,
  fragile = false,
}: LabelContentsPreviewProps): ReactElement {
  const visibleColumns = contentColumnCount(columns, contents.length);
  const contentGroups = splitContents(contents, visibleColumns);

  return (
    <article
      className="flex overflow-hidden border border-print-rule bg-qr-quiet-zone p-5 text-print-ink shadow-sm"
      style={{ width: LABEL_WIDTH, height: LABEL_HEIGHT }}
    >
      <div className="flex min-h-0 w-full flex-col">
        <LabelHeader fragile={fragile} />

        <section className="min-h-0 flex-1 pt-3">
          <h2 className="mb-2 text-sm font-bold text-print-ink">Contents ({contents.length})</h2>
          <div className={visibleColumns === 2 ? 'grid grid-cols-2 gap-x-5' : 'grid grid-cols-1'}>
            {contentGroups.map((group) => (
              <ul key={group.join('|')} className="grid min-w-0 gap-0.5">
                {group.map((item) => (
                  <li key={item} className="truncate text-xs leading-tight font-medium">
                    {item}
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>
      </div>
    </article>
  );
}

function ReviewSurface({ columns, contents }: LabelContentsPreviewProps): ReactElement {
  const visibleColumns = contentColumnCount(columns, contents.length);

  return (
    <main className="min-h-screen bg-muted p-8">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-5">
        <div className="flex w-full max-w-2xl items-end justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-foreground">Four labels per A4 sheet</p>
            <p className="text-sm text-muted-foreground">
              99.1 × 139 mm label · 32 mm QR · {visibleColumns === 2 ? 'two-column' : 'one-column'}{' '}
              contents
            </p>
          </div>
          <span className="rounded-full border border-border bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            Print preview
          </span>
        </div>
        <LabelContentsPreview columns={columns} contents={contents} />
      </div>
    </main>
  );
}

/** Metadata for the printed container-label contents layout review. */
export const meta: ScreenMeta = { title: 'Label contents layout', order: 19, frame: 'none' };

/** Comparable density states for the same physical label geometry. */
export const states: ScreenStates = {
  'one-column': () => <ReviewSurface columns={1} contents={labelContents} />,
  'two-columns': () => <ReviewSurface columns={2} contents={labelContents} />,
  'few-items': () => <ReviewSurface columns={2} contents={shortLabelContents} />,
};

/** Renders the useful dense case: eighteen contents split across two columns. */
export default function LabelContentsLayoutScreen(): ReactElement {
  return <ReviewSurface columns={2} contents={labelContents} />;
}
