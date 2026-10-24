import { ContactReview, reviewStates } from '@/experiments/contacts-import-review/review';

import type { ScreenMeta } from '@/contract';

/** Contact import review entry in the playground. */
export const meta: ScreenMeta = { title: 'Import review', order: 3, frame: 'web' };
/** Review boundary states use the same fixture set as the alternatives. */
export const states = reviewStates('table');

/** Stages the batch review proposal without recording a design decision. */
export default function ImportReviewScreen() {
  return <ContactReview layout="table" />;
}
