import { itemUri } from '@pops/inventory/labels';
import { FieldIcon, isFieldIconName, QrCode, cn } from '@pops/ui';

import type { CSSProperties, ReactElement, ReactNode } from 'react';

import type {
  FittedList,
  LabelFieldValue,
  PrintSubject,
  SheetLayout,
} from '@pops/inventory/labels';

/** Renders a subject QR at its planned physical size. */
export function LabelQr({ subject, sizeMm }: { subject: PrintSubject; sizeMm: number }) {
  const size = `${sizeMm}mm`;
  return (
    <div className="shrink-0" style={{ width: size, height: size }}>
      <QrCode
        value={itemUri(subject.id)}
        title={`QR code for ${subject.name}`}
        className="max-w-none"
      />
    </div>
  );
}

function clampLines(lines: number): CSSProperties {
  return {
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: lines,
    overflow: 'hidden',
  };
}

/** Renders a name at its planned point size and line limit. */
export function LabelName({ name, pt, lines }: { name: string; pt: number; lines: number }) {
  return (
    <p
      className="break-words font-semibold leading-tight"
      style={{ fontSize: `${pt}pt`, ...clampLines(lines) }}
    >
      {name}
    </p>
  );
}

function LabelCode({ code, pt }: { code: string; pt: number }) {
  return (
    <p
      className="break-all font-mono font-bold leading-none tracking-normal"
      style={{ fontSize: `${pt}pt` }}
      data-code-pt={pt}
    >
      {code}
    </p>
  );
}

function MissingCode({ layout }: { layout: SheetLayout }) {
  return (
    <p
      className="rounded-sm border border-dashed border-print-rule-strong px-1 py-0.5 font-medium text-print-rule-strong"
      style={{ fontSize: `${layout.scale.codeMinPt}pt` }}
      data-missing-code
    >
      Needs a code
    </p>
  );
}

/** Renders a planned code or the missing-code print marker. */
export function CodeOrMissing({
  code,
  layout,
  pt,
}: {
  code: string | null;
  layout: SheetLayout;
  pt: number;
}) {
  return code ? <LabelCode code={code} pt={pt} /> : <MissingCode layout={layout} />;
}

function ListLine({
  children,
  strong,
  lineHeight,
}: {
  children: ReactNode;
  strong?: boolean;
  lineHeight?: number;
}) {
  return (
    <li
      className={cn(
        'truncate leading-tight',
        lineHeight !== undefined && 'overflow-hidden',
        strong && 'font-semibold'
      )}
      style={
        lineHeight === undefined
          ? undefined
          : { lineHeight, height: `${lineHeight}em`, maxHeight: `${lineHeight}em` }
      }
    >
      {children}
    </li>
  );
}

function More({ count, lineHeight }: { count: number; lineHeight?: number }) {
  return count > 0 ? (
    <ListLine strong lineHeight={lineHeight}>
      +{count} more
    </ListLine>
  ) : null;
}

/** Renders fitted field rows, including decorative configured icons. */
export function FieldList({
  list,
  lineHeight,
}: {
  list: FittedList<LabelFieldValue>;
  lineHeight?: number;
}): ReactElement {
  return (
    <ul
      className="min-w-0 max-w-full"
      style={{ fontSize: `${list.pt}pt` }}
      aria-label="Fields"
      data-label-fields
    >
      {list.shown.map((field) => (
        <ListLine key={field.id} lineHeight={lineHeight}>
          {isFieldIconName(field.icon) ? (
            <>
              <span className="sr-only">{field.label}:</span>
              <span
                className={cn(
                  'mr-1 inline-flex items-center',
                  lineHeight === undefined ? 'align-middle' : 'align-text-bottom'
                )}
                aria-hidden="true"
              >
                <FieldIcon name={field.icon} size="1.25em" />
              </span>
            </>
          ) : (
            <span className="font-semibold">{field.label}:</span>
          )}{' '}
          {field.value}
        </ListLine>
      ))}
      <More count={list.more} lineHeight={lineHeight} />
    </ul>
  );
}

/** Renders the legacy single-column fitted contents list. */
export function ContentsList({ list }: { list: FittedList<string> }): ReactElement {
  return (
    <ul style={{ fontSize: `${list.pt}pt` }} aria-label="Contents" data-label-contents>
      {list.shown.map((line) => (
        <ListLine key={line}>{line}</ListLine>
      ))}
      <More count={list.more} />
    </ul>
  );
}
