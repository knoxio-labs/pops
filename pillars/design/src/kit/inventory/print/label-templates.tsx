import { itemUri, LABEL_GAP_MM } from '@pops/inventory/labels';
/**
 * One label, drawn from what the job chose to show. Each fills one die-cut
 * label of the chosen sheet; sizes come from the layout's `LabelScale` and
 * `planLabel`, in millimetres and points, so the preview and the printed
 * sheet are the same drawing.
 *
 * Everything is solid ink on white: hierarchy is size and weight, never grey
 * or colour, so a monochrome laser prints exactly what the preview shows.
 * No label carries a place: after the move every place on it is wrong.
 */
import { QrCode, cn } from '@pops/ui';

import { autoParts } from './label-content';
import { planLabel } from './label-layout';

import type { CSSProperties, ReactNode } from 'react';

import type { PrintSubject, SheetLayout } from '@pops/inventory/labels';

import type { LabelFieldValue, ResolvedLabel } from './label-content';
import type { FittedList, LabelPlan } from './label-layout';

interface LabelProps {
  subject: PrintSubject;
  layout: SheetLayout;
}

function LabelQr({ subject, sizeMm }: { subject: PrintSubject; sizeMm: number }) {
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

function LabelName({ name, pt, lines }: { name: string; pt: number; lines: number }) {
  return (
    <p
      className="font-semibold leading-tight break-words"
      style={{ fontSize: `${pt}pt`, ...clampLines(lines) }}
    >
      {name}
    </p>
  );
}

function LabelCode({ code, pt }: { code: string; pt: number }) {
  return (
    <p
      className="font-mono font-bold leading-none tracking-normal break-all"
      style={{ fontSize: `${pt}pt` }}
      data-code-pt={pt}
    >
      {code}
    </p>
  );
}

/**
 * Where the code goes on an item that has none yet. Only the preview shows
 * it: the page will not print until every item has a code.
 */
function MissingCode({ layout }: { layout: SheetLayout }) {
  return (
    <p
      className="rounded-[1mm] border border-dashed border-print-rule-strong px-[1mm] py-[0.5mm] font-medium text-print-rule-strong"
      style={{ fontSize: `${layout.scale.codeMinPt}pt` }}
      data-missing-code
    >
      Needs a code
    </p>
  );
}

function CodeOrMissing({
  code,
  pt,
  layout,
}: {
  code: string | null;
  pt: number;
  layout: SheetLayout;
}) {
  return code ? <LabelCode code={code} pt={pt} /> : <MissingCode layout={layout} />;
}

function ListLine({ children, strong }: { children: ReactNode; strong?: boolean }) {
  return <li className={cn('truncate leading-[1.3]', strong && 'font-semibold')}>{children}</li>;
}

function More({ count }: { count: number }) {
  return count > 0 ? <ListLine strong>+{count} more</ListLine> : null;
}

function FieldList({ list }: { list: FittedList<LabelFieldValue> }) {
  return (
    <ul style={{ fontSize: `${list.pt}pt` }} aria-label="Fields" data-label-fields>
      {list.shown.map((field) => (
        <ListLine key={field.id}>
          <span className="font-semibold">{field.label}:</span> {field.value}
        </ListLine>
      ))}
      <More count={list.more} />
    </ul>
  );
}

function ContentsList({ list }: { list: FittedList<string> }) {
  return (
    <ul style={{ fontSize: `${list.pt}pt` }} aria-label="Contents" data-label-contents>
      {list.shown.map((line) => (
        <ListLine key={line}>{line}</ListLine>
      ))}
      <More count={list.more} />
    </ul>
  );
}

function TextColumn({ plan, subject, layout }: LabelProps & { plan: LabelPlan }) {
  const centred = plan.arrangement === 'text' && plan.fields === null && plan.contents === null;
  return (
    <div
      className={cn(
        'flex min-w-0 flex-1 flex-col justify-center overflow-hidden',
        centred && 'items-center text-center'
      )}
      style={{ gap: '1mm', maxHeight: '100%' }}
    >
      {plan.name ? (
        <LabelName name={subject.name} pt={plan.name.pt} lines={plan.name.lines} />
      ) : null}
      {plan.code ? <CodeOrMissing code={subject.code} pt={plan.code.pt} layout={layout} /> : null}
      {plan.fields ? <FieldList list={plan.fields} /> : null}
      {plan.contents ? <ContentsList list={plan.contents} /> : null}
    </div>
  );
}

/** One label showing the parts `label` resolved to, laid out for the sheet. */
export function ContentLabel({ subject, layout, label }: LabelProps & { label: ResolvedLabel }) {
  const plan = planLabel(label, subject, layout);
  return (
    <div
      className={cn(
        'flex h-full w-full items-center overflow-hidden',
        plan.arrangement === 'qr-fill' && 'justify-center'
      )}
      style={{ padding: `${layout.scale.paddingMm}mm`, gap: `${LABEL_GAP_MM}mm` }}
      data-arrangement={plan.arrangement}
    >
      {plan.qrMm === null ? null : <LabelQr subject={subject} sizeMm={plan.qrMm} />}
      {plan.arrangement === 'qr-fill' ? null : (
        <TextColumn plan={plan} subject={subject} layout={layout} />
      )}
    </div>
  );
}

function autoLabel(kind: PrintSubject['kind']): ResolvedLabel {
  return { parts: autoParts(kind), fields: [], contents: [], fallback: false };
}

/** QR, name and code: the label Auto gives a box. */
export function ContainerLabel({ subject, layout }: LabelProps) {
  return <ContentLabel subject={subject} layout={layout} label={autoLabel('container')} />;
}

/** QR and code: the label Auto gives a thing. */
export function ItemLabel({ subject, layout }: LabelProps) {
  return <ContentLabel subject={subject} layout={layout} label={autoLabel('item')} />;
}
