import type { CaptureBrowserSession } from './browser-session';
import type { CaptureSource } from './types';
import type { CaptureContext } from './use-capture-context';

/** A source-owned Idea row rendered by Explore fields. */
export type Idea = CaptureSource['ideas'][number];

/** Source row, current editable values and independent context used by Idea field controls. */
export interface IdeaFieldProps {
  session: CaptureBrowserSession;
  row: Idea;
  value: Idea;
  busy: boolean;
  context: CaptureContext;
}
