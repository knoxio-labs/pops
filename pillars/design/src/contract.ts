/**
 * What a screen file exports. This is the whole contract between the design
 * surface (`src/screens`, `src/experiments`) and the playground: a default
 * component, a `meta`, and optionally a `states` map. Nothing is registered
 * anywhere — a file in the right place is discovered (see `registry/`).
 */
import type { ComponentType } from 'react';

import type { FrameKind } from './frames/kind';

export interface ScreenMeta {
  /** Sidebar label. */
  title: string;
  /** Sort key within the area; ties break on filename. */
  order?: number;
  /**
   * Flow steps only: `false` drops the flow's bottom Back/Next bar (the top
   * stepper still navigates) for a step that provides its own stage
   * navigation. A flow hides the bar if any of its steps opts out.
   */
  flowButtons?: boolean;
  /**
   * The product chrome this screen is designed for, applied when you navigate
   * to it — so an iOS screen opens in the phone rather than in whatever frame
   * the last screen left behind. It is a default, not a lock: change the frame
   * afterwards and the choice holds until you navigate somewhere that declares
   * its own. A screen that says nothing keeps the current frame.
   */
  frame?: FrameKind;
}

/**
 * Named conditions of a screen — `empty`, `loading`, `error`, `row-selected` —
 * each a thunk rendering the component under that condition. The default
 * render is the implicit `default` state and is never listed here.
 */
export type ScreenStates = Record<string, ComponentType>;
