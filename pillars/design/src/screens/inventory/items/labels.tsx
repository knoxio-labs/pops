import {
  codeHolder,
  customSheet27,
  customSheetNarrow,
  customSheetTooSmall,
  kitchen12,
  kitchen12Uncoded,
  kitchen12WithContents,
  office04,
  printBoxes,
  printHandful,
  printLongNames,
  television,
} from '@/fixtures/inventory-print';
import { printDetails } from '@/fixtures/inventory-print-details';
import { office04WithContents } from '@/fixtures/inventory-print-office';
import { PrintLabelsLoading, PrintLabelsPage } from '@/kit/inventory/print/print-labels-page';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { LabelContent, LabelPart } from '@/kit/inventory/print/label-content';
import type { LabelDetails } from '@/kit/inventory/print/label-content';
import type { PrintCatalogueEntry } from '@/kit/inventory/print/print-add-dialog';
import type { TakenCode } from '@/kit/inventory/print/print-code-field';
import type { PrintLabelsPageProps } from '@/kit/inventory/print/print-labels-page';

export const meta: ScreenMeta = { title: 'Print labels', order: 18, frame: 'web' };

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
  seed: { subjects: printBoxes, sheetId: 'L7160', customSheet: null, details: printDetails },
  source: '6 boxes packed this week',
  catalogue,
  lookup,
};

const uncoded: PrintLabelsPageProps = {
  ...boxes,
  seed: { ...boxes.seed, subjects: kitchen12Uncoded, sheetId: 'L7163' },
  source: 'Kitchen 12 and its contents',
};

const handful: PrintLabelsPageProps = {
  ...boxes,
  seed: { ...boxes.seed, subjects: printHandful },
  source: '4 chosen from Items',
};

function page(props: PrintLabelsPageProps) {
  return () => <PrintLabelsPage {...props} />;
}

function custom(customSheet: PrintLabelsPageProps['seed']['customSheet']): PrintLabelsPageProps {
  return {
    ...boxes,
    seed: { ...boxes.seed, subjects: kitchen12WithContents, sheetId: 'custom', customSheet },
    source: 'Kitchen 12 and its contents',
  };
}

function shows(parts: LabelPart[], fields: string[] = []): LabelContent {
  return { kind: 'parts', parts, fields };
}

function showing(
  content: LabelContent,
  seed: Partial<PrintLabelsPageProps['seed']> = {},
  source = boxes.source
) {
  return page({ ...boxes, source, seed: { ...boxes.seed, ...seed, content } });
}

const ROOM_AND_PACKED = ['moving-box.room', 'moving-box.packed', 'moving-box.fragile'];
const BRAND_AND_MODEL = ['appliance.brand', 'appliance.model', 'power-tool.brand', 'network.brand'];

const treeDetails: Readonly<Record<string, LabelDetails>> = {
  ...printDetails,
  [television.id]: {
    typeName: 'Sheet',
    fields: [
      { id: 'bedding.material', label: 'Material', value: 'Cotton', typeName: 'Bedding' },
      { id: 'bedding.colour', label: 'Colour', value: 'White', typeName: 'Bedding' },
      { id: 'sheet.fitted', label: 'Fitted', value: 'Yes' },
    ],
    contents: [],
  },
};

/**
 * What a label shows, one state per kind and a few mixes. The first set is
 * the presets; the `shows-*-and-*` states are custom mixes from the ticks.
 */
const labelShowsStates: ScreenStates = {
  'label-shows-picker': page({ ...boxes, labelShowsOpen: true }),
  'label-shows-picker-custom': page({
    ...handful,
    labelShowsOpen: true,
    seed: {
      ...handful.seed,
      content: shows(['qr', 'code'], ['appliance.brand', 'appliance.model']),
    },
  }),
  'label-fields-tree': page({
    ...handful,
    labelShowsOpen: true,
    seed: {
      ...handful.seed,
      subjects: [television],
      details: treeDetails,
      content: shows([], ['bedding.material', 'bedding.colour', 'sheet.fitted']),
    },
  }),
  'shows-qr-only': showing(shows(['qr'])),
  'shows-code-only': showing(shows(['code'])),
  'shows-name-only': showing(shows(['name'])),
  'shows-contents-only': showing(shows(['contents']), { sheetId: 'L7163' }),
  'shows-contents-with-items': showing(
    shows(['contents']),
    { subjects: kitchen12WithContents, sheetId: 'L7163' },
    'Kitchen 12 and its contents'
  ),
  'shows-fields-only': showing(
    shows([], BRAND_AND_MODEL),
    { subjects: printHandful, sheetId: 'L7163' },
    handful.source
  ),
  'shows-qr-name-and-fields': showing(shows(['qr', 'name'], ROOM_AND_PACKED), {
    sheetId: 'L7163',
  }),
  'shows-name-and-contents': showing(shows(['name', 'contents']), { sheetId: 'L7165' }),
  'shows-qr-code-and-contents': showing(shows(['qr', 'code', 'contents']), { sheetId: 'L7165' }),
  'shows-code-and-fields': showing(
    shows(['code'], BRAND_AND_MODEL),
    { subjects: printHandful },
    handful.source
  ),
  'shows-code-on-small-labels': showing(shows(['code']), {
    sheetId: 'custom',
    customSheet: customSheetTooSmall,
  }),
  'shows-too-narrow-for-fields': showing(shows(['qr', 'name', 'code'], ROOM_AND_PACKED), {
    sheetId: 'custom',
    customSheet: customSheetNarrow,
  }),
};

export const states: ScreenStates = {
  'one-item': page({
    ...boxes,
    seed: { ...boxes.seed, subjects: [television] },
    source: 'Television',
  }),
  'container-and-contents': page({
    ...boxes,
    seed: { ...boxes.seed, subjects: kitchen12WithContents, sheetId: 'L7163' },
    source: 'Kitchen 12 and its contents',
  }),
  'chosen-handful': page(handful),
  'from-selection': page({ ...handful, source: '4 selected in Items' }),
  'partial-sheet': page({ ...handful, seed: { ...handful.seed, startAt: 14 } }),
  'one-copy-per-box': page({
    ...boxes,
    seed: { ...boxes.seed, copies: { container: 1, item: 1 } },
  }),
  'large-labels': page({ ...boxes, seed: { ...boxes.seed, sheetId: 'L7165' } }),
  'custom-sheet': page(custom(customSheet27)),
  'custom-sheet-form': page({ ...custom(customSheet27), customOpen: true }),
  'custom-sheet-narrow': page(custom(customSheetNarrow)),
  'custom-sheet-too-small': page(custom(customSheetTooSmall)),
  'no-code': page(uncoded),
  'no-code-typing': page({ ...uncoded, editSeed: { id: kitchen12Uncoded[2]?.id ?? '' } }),
  'code-taken': page({
    ...uncoded,
    editSeed: { id: kitchen12Uncoded[2]?.id ?? '', draft: codeHolder.code, taken: true },
  }),
  'long-names': page({
    ...boxes,
    seed: { ...boxes.seed, subjects: printLongNames },
    source: '4 chosen from Items',
  }),
  'many-labels': page({
    ...boxes,
    seed: { ...boxes.seed, subjects: office04WithContents, sheetId: 'L7163', startAt: 7 },
    source: 'Office 04 and its contents',
  }),
  monochrome: page({ ...boxes, monochrome: true }),
  'after-print': page({ ...boxes, seed: { ...boxes.seed, outcome: 'asking' } }),
  printed: page({ ...boxes, seed: { ...boxes.seed, startAt: 13, outcome: 'printed' } }),
  'print-cancelled': page({ ...boxes, seed: { ...boxes.seed, outcome: 'cancelled' } }),
  'nothing-selected': page({
    ...boxes,
    seed: { ...boxes.seed, subjects: [] },
    source: 'Opened from Items',
  }),
  adding: page({ ...handful, addOpen: true }),
  loading: () => <PrintLabelsLoading />,
  ...labelShowsStates,
};

export default function PrintLabelsScreen() {
  return <PrintLabelsPage {...boxes} />;
}
