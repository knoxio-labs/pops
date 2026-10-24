import { ContactReview, reviewStates } from '@/experiments/contacts-import-review/review';

import type { ScreenMeta } from '@/contract';

/** Compare proposal; provider treatment and field retention match the other variant. */
export const meta: ScreenMeta = { title: 'Import review', order: 3, frame: 'web' };
/** Shared fixture boundary conditions. */
export const states = reviewStates('compare');

/** Stages the compare identity review layout. */
export default function ImportReviewVariant() {
  return <ContactReview layout="compare" />;
}
