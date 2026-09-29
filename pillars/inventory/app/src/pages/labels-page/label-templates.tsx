import { autoParts, LABEL_GAP_MM, planLabel } from '@pops/inventory/labels';
import { cn } from '@pops/ui';

import { QrHeaderLabel } from './label-qr-header';
import { CodeOrMissing, ContentsList, FieldList, LabelName, LabelQr } from './label-template-parts';

import type { LabelPlan, PrintSubject, ResolvedLabel, SheetLayout } from '@pops/inventory/labels';

interface LabelProps {
  subject: PrintSubject;
  layout: SheetLayout;
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

function HeaderLabel({ plan, subject, layout }: LabelProps & { plan: LabelPlan }) {
  if (!plan.header || !plan.contents) return null;
  return (
    <QrHeaderLabel
      header={plan.header}
      contents={plan.contents}
      qr={plan.qrMm === null ? null : <LabelQr subject={subject} sizeMm={plan.qrMm} />}
      name={
        plan.name ? (
          <LabelName name={subject.name} pt={plan.name.pt} lines={plan.name.lines} />
        ) : null
      }
      code={
        plan.code ? <CodeOrMissing code={subject.code} pt={plan.code.pt} layout={layout} /> : null
      }
      fields={plan.fields ? <FieldList list={plan.fields} lineHeight={1.3} /> : null}
    />
  );
}

/** One label showing the content resolved for the item and the selected sheet. */
export function ContentLabel({ subject, layout, label }: LabelProps & { label: ResolvedLabel }) {
  const plan = planLabel(label, subject, layout);
  if (plan.arrangement === 'qr-header') {
    return (
      <div
        className="h-full w-full overflow-hidden"
        style={{ padding: `${layout.scale.paddingMm}mm` }}
        data-arrangement={plan.arrangement}
      >
        <HeaderLabel plan={plan} subject={subject} layout={layout} />
      </div>
    );
  }
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

/** One label in the resolved content choice. */
export function PrintLabel({ subject, layout, label }: LabelProps & { label: ResolvedLabel }) {
  return <ContentLabel subject={subject} layout={layout} label={label} />;
}
