import {
  codeHolder,
  kitchen12,
  kitchen12Uncoded,
  kitchen12WithContents,
  office04,
  printBoxes,
  printHandful,
  printLongNames,
  television,
} from '@/fixtures/inventory-print';
import { office04WithContents } from '@/fixtures/inventory-print-office';
import { PrintLabelsLoading, PrintLabelsPage } from '@/kit/inventory/print/print-labels-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { PrintCatalogueEntry } from '@/kit/inventory/print/print-add-dialog';
import type { TakenCode } from '@/kit/inventory/print/print-code-field';
import type { PrintLabelsPageProps } from '@/kit/inventory/print/print-labels-page';

export const meta: ScreenMeta = { title: 'Print labels', order: 1, frame: 'web' };

const catalogue: PrintCatalogueEntry[] = [
  { subject: kitchen12, contents: kitchen12WithContents.slice(1) },
  { subject: office04, contents: office04WithContents.slice(1) },
  ...printBoxes
    .filter((box) => box !== kitchen12 && box !== office04)
    .map((subject) => ({ subject, contents: [] })),
  ...printHandful.map((subject) => ({ subject, contents: [] })),
];

function lookup(code: string): TakenCode | null {
  return code === codeHolder.code
    ? { holder: codeHolder.name, suggestion: codeHolder.suggestion }
    : null;
}

const boxes: PrintLabelsPageProps = {
  seed: { subjects: printBoxes, template: 'container', layoutId: 'a4-8' },
  source: '6 boxes packed this week',
  catalogue,
  lookup,
};

const uncoded: PrintLabelsPageProps = {
  ...boxes,
  seed: { subjects: kitchen12Uncoded, template: 'container', layoutId: 'a4-14' },
  source: 'Kitchen 12 and its contents',
};

const handful: PrintLabelsPageProps = {
  ...boxes,
  seed: { subjects: printHandful, template: 'item', layoutId: 'a4-21' },
  source: '4 chosen from Items',
};

function page(props: PrintLabelsPageProps) {
  return () => <PrintLabelsPage {...props} />;
}

export const states: ScreenStates = {
  'one-item': page({
    ...boxes,
    seed: { subjects: [television], template: 'item', layoutId: 'a4-21' },
    source: 'Television',
  }),
  'container-and-contents': page({
    ...boxes,
    seed: { subjects: kitchen12WithContents, template: 'container', layoutId: 'a4-14' },
    source: 'Kitchen 12 and its contents',
  }),
  'chosen-handful': page(handful),
  'partial-sheet': page({ ...handful, seed: { ...handful.seed, startAt: 14 } }),
  'two-copies': page({ ...boxes, seed: { ...boxes.seed, copies: 2 } }),
  'no-code': page(uncoded),
  'no-code-typing': page({ ...uncoded, editSeed: { id: kitchen12Uncoded[2]?.id ?? '' } }),
  'code-taken': page({
    ...uncoded,
    editSeed: { id: kitchen12Uncoded[2]?.id ?? '', draft: codeHolder.code, taken: true },
  }),
  'long-names': page({
    ...boxes,
    seed: { subjects: printLongNames, template: 'container', layoutId: 'a4-21' },
    source: '4 chosen from Items',
  }),
  'many-labels': page({
    ...boxes,
    seed: { subjects: office04WithContents, template: 'item', layoutId: 'a4-14', startAt: 7 },
    source: 'Office 04 and its contents',
  }),
  monochrome: page({ ...boxes, monochrome: true }),
  'after-print': page({ ...boxes, seed: { ...boxes.seed, outcome: 'asking' } }),
  printed: page({ ...boxes, seed: { ...boxes.seed, startAt: 7, outcome: 'printed' } }),
  'print-cancelled': page({ ...boxes, seed: { ...boxes.seed, outcome: 'cancelled' } }),
  'nothing-selected': page({
    ...boxes,
    seed: { ...boxes.seed, subjects: [] },
    source: 'Opened from Items',
  }),
  adding: page({ ...handful, addOpen: true }),
  loading: () => <PrintLabelsLoading />,
};

export default function PrintLabelsScreen() {
  return <PrintLabelsPage {...boxes} />;
}
