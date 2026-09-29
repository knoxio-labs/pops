import { LABEL_GAP_MM } from '@pops/inventory/labels';

import type { ReactElement, ReactNode } from 'react';

import type { FittedList, LabelPlan } from '@pops/inventory/labels';

interface QrHeaderLabelProps {
  header: NonNullable<LabelPlan['header']>;
  contents: FittedList<string>;
  qr: ReactNode;
  name: ReactNode;
  code: ReactNode;
  fields: ReactNode;
}

interface ContentLine {
  id: string;
  text: string;
  more: boolean;
}

function contentsLines(contents: FittedList<string>): ContentLine[] {
  const seen = new Map<string, number>();
  const lines = contents.shown.map((text) => {
    const occurrence = (seen.get(text) ?? 0) + 1;
    seen.set(text, occurrence);
    return { id: `${text}-${occurrence}`, text, more: false };
  });
  if (contents.more > 0) {
    lines.push({ id: 'more', text: `+${contents.more} more`, more: true });
  }
  return lines;
}

function ContentsBody({
  header,
  contents,
}: Pick<QrHeaderLabelProps, 'header' | 'contents'>): ReactElement {
  const lines = contentsLines(contents);
  const lineHeightPt = Number((contents.pt * 1.3).toFixed(3));
  const rows = Math.min(header.rows, Math.max(1, Math.ceil(lines.length / header.columns)));

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <h2
        className="shrink-0 overflow-hidden font-semibold text-print-ink"
        style={{
          height: `${header.headingHeightMm}mm`,
          fontSize: `${contents.pt}pt`,
          lineHeight: 1.3,
        }}
      >
        Contents ({contents.shown.length + contents.more})
      </h2>
      <ul
        aria-label="Contents"
        className="grid min-h-0 min-w-0 flex-1 overflow-hidden"
        style={{
          fontSize: `${contents.pt}pt`,
          lineHeight: 1.3,
          gridTemplateRows: `repeat(${rows}, ${lineHeightPt}pt)`,
          gridTemplateColumns: `repeat(${header.columns}, minmax(0, 1fr))`,
          gridAutoFlow: 'column',
          columnGap: `${header.columnGapMm}mm`,
        }}
        data-label-contents
        data-label-columns={header.columns}
      >
        {lines.map((line) => (
          <li key={line.id} className="min-w-0 truncate" data-more={line.more ? '' : undefined}>
            {line.text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Renders the measured top-header and full-width contents arrangement. */
export function QrHeaderLabel({
  header,
  contents,
  qr,
  name,
  code,
  fields,
}: QrHeaderLabelProps): ReactElement {
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-hidden" data-label-qr-header>
      <header
        className="flex shrink-0 items-start overflow-hidden"
        style={{ height: `${header.heightMm}mm`, gap: `${LABEL_GAP_MM}mm` }}
        data-label-header
      >
        {qr}
        <div
          className="flex min-w-0 flex-1 flex-col items-start justify-start overflow-hidden"
          style={{ gap: '1mm', maxHeight: '100%' }}
          data-label-header-text
        >
          {name ? <div className="max-w-full shrink-0">{name}</div> : null}
          {code ? <div className="max-w-full shrink-0">{code}</div> : null}
          {fields ? <div className="max-w-full shrink-0">{fields}</div> : null}
        </div>
      </header>

      <div
        className="box-border shrink-0 border-t border-print-rule"
        style={{ height: `${header.bodyGapMm}mm` }}
        aria-hidden="true"
        data-label-body-gap
      />

      <ContentsBody header={header} contents={contents} />
    </div>
  );
}
