/**
 * The two label templates. Each fills one die-cut label of the chosen sheet;
 * sizes come from the layout's `LabelScale`, in millimetres and points, so
 * the preview and the printed sheet are the same drawing.
 *
 * Everything is solid ink on white: hierarchy is size and weight, never grey
 * or colour, so a monochrome laser prints exactly what the preview shows.
 */
import { MapPin } from 'lucide-react';

import { QrCode } from '@pops/ui';

import { fitCodePt } from './code-fit';
import { itemUri } from './print-subject';

import type { ReactNode } from 'react';

import type { LabelTemplateId, PrintSubject } from './print-subject';
import type { SheetLayout } from './sheet-layouts';

const GAP_MM = 1.5;

interface LabelProps {
  subject: PrintSubject;
  layout: SheetLayout;
}

function textWidthMm(layout: SheetLayout): number {
  const { paddingMm, qrMm } = layout.scale;
  return layout.labelWidthMm - paddingMm * 2 - qrMm - GAP_MM;
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
      style={{ padding: `${layout.scale.paddingMm}mm`, gap: `${GAP_MM}mm` }}
    >
      <LabelQr subject={subject} layout={layout} />
      <div className="flex min-w-0 flex-1 flex-col justify-center" style={{ gap: '1mm' }}>
        {children}
      </div>
    </div>
  );
}

function LabelName({ name, layout, lines }: { name: string; layout: SheetLayout; lines: number }) {
  return (
    <p
      className="font-semibold leading-tight break-words"
      style={{
        fontSize: `${layout.scale.namePt}pt`,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: lines,
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

function LabelPlace({ place, layout }: { place: string; layout: SheetLayout }) {
  return (
    <p
      className="flex min-w-0 items-center gap-[0.8mm] font-medium"
      style={{ fontSize: `${layout.scale.placePt}pt` }}
    >
      <MapPin className="shrink-0" style={{ width: '1em', height: '1em' }} aria-hidden />
      <span className="truncate">{place}</span>
    </p>
  );
}

/** QR, name, code and place: the label a box carries. */
export function ContainerLabel({ subject, layout }: LabelProps) {
  return (
    <LabelFrame subject={subject} layout={layout}>
      <LabelName name={subject.name} layout={layout} lines={layout.scale.nameLines} />
      {subject.code ? <LabelCode code={subject.code} layout={layout} /> : null}
      {subject.place ? <LabelPlace place={subject.place} layout={layout} /> : null}
    </LabelFrame>
  );
}

/**
 * QR and code: the label a thing carries. An item with no code prints its
 * name in the code's place, so the label is still readable by a person.
 */
export function ItemLabel({ subject, layout }: LabelProps) {
  return (
    <LabelFrame subject={subject} layout={layout}>
      {subject.code ? (
        <LabelCode code={subject.code} layout={layout} />
      ) : (
        <LabelName name={subject.name} layout={layout} lines={layout.scale.nameLines} />
      )}
    </LabelFrame>
  );
}

/** One label in the chosen template. */
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
