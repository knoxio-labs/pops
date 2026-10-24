import { ContactReview, reviewStates } from '@/experiments/contacts-import-review/review';

import type { ScreenMeta } from '@/contract';

/** Table proposal; provider treatment and field retention match the other variant. */
export const meta: ScreenMeta = { title: 'Import review', order: 3, frame: 'web' };
/** Shared fixture boundary conditions. */
export const states = reviewStates('table');

/** Stages the table identity review layout. */
export default function ImportReviewVariant() {
  return <ContactReview layout="table" />;
}
