/**
 * The two label templates. Each fills one die-cut label of the chosen sheet;
 * sizes come from the layout's `LabelScale`, in millimetres and points, so
 * the preview and the printed sheet are the same drawing.
 *
 * Everything is solid ink on white: hierarchy is size and weight, never grey
 * or colour, so a monochrome laser prints exactly what the preview shows.
 * A box label carries no place: after the move every place on it is wrong.
 */
import { QrCode } from '@pops/ui';

import { fitCodePt } from './code-fit';
import { itemUri } from './print-subject';
import { LABEL_GAP_MM, textWidthMm } from './sheet-layouts';

import type { ReactNode } from 'react';

import type { LabelTemplateId, PrintSubject } from './print-subject';
import type { SheetLayout } from './sheet-layouts';

interface LabelProps {
  subject: PrintSubject;
  layout: SheetLayout;
}

function LabelQr({ subject, layout }: LabelProps) {
  const size = `${layout.scale.qrMm}mm`;
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

function LabelFrame({ subject, layout, children }: LabelProps & { children: ReactNode }) {
  return (
    <div
      className="flex h-full w-full items-center overflow-hidden"
      style={{ padding: `${layout.scale.paddingMm}mm`, gap: `${LABEL_GAP_MM}mm` }}
    >
      <LabelQr subject={subject} layout={layout} />
      <div className="flex min-w-0 flex-1 flex-col justify-center" style={{ gap: '1mm' }}>
        {children}
      </div>
    </div>
  );
}

function LabelName({ name, layout }: { name: string; layout: SheetLayout }) {
  return (
    <p
      className="font-semibold leading-tight break-words"
      style={{
        fontSize: `${layout.scale.namePt}pt`,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: layout.scale.nameLines,
        overflow: 'hidden',
      }}
    >
      {name}
    </p>
  );
}

function LabelCode({ code, layout }: { code: string; layout: SheetLayout }) {
  const { codePt, codeMinPt } = layout.scale;
  const pt = fitCodePt(code, textWidthMm(layout), codePt, codeMinPt);
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

function CodeOrMissing({ subject, layout }: LabelProps) {
  return subject.code ? (
    <LabelCode code={subject.code} layout={layout} />
  ) : (
    <MissingCode layout={layout} />
  );
}

/** QR, name and code: the label a box carries. */
export function ContainerLabel({ subject, layout }: LabelProps) {
  return (
    <LabelFrame subject={subject} layout={layout}>
      <LabelName name={subject.name} layout={layout} />
      <CodeOrMissing subject={subject} layout={layout} />
    </LabelFrame>
  );
}

/** QR and code: the label a thing carries. */
export function ItemLabel({ subject, layout }: LabelProps) {
  return (
    <LabelFrame subject={subject} layout={layout}>
      <CodeOrMissing subject={subject} layout={layout} />
    </LabelFrame>
  );
}

/** One label in the given template. */
export function PrintLabel({
  template,
  subject,
  layout,
}: LabelProps & { template: LabelTemplateId }) {
  return template === 'container' ? (
    <ContainerLabel subject={subject} layout={layout} />
  ) : (
    <ItemLabel subject={subject} layout={layout} />
  );
}
