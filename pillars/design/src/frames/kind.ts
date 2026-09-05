/**
 * Which product chrome the surface is drawn inside.
 *
 * A screen reviewed on its own answers "does this layout work"; a screen
 * reviewed inside the chrome it will ship in answers "does this layout work
 * *here*" — with a rail eating 64px, a top bar eating 56, and the page nav
 * appearing and vanishing at the breakpoints the shell actually uses. Both
 * questions are worth asking, so the frame is an axis rather than a setting.
 *
 * The frame renders inside the canvas iframe, not around it, so the chrome
 * collapses at the simulated width rather than the browser's.
 */
/** The one list. `FrameKind` derives from it, and so does the schema that
 *  validates a screen's declared default. */
export const FRAME_KINDS = ['none', 'web'] as const;

export type FrameKind = (typeof FRAME_KINDS)[number];

const LABELS: Record<FrameKind, string> = {
  none: 'No frame',
  web: 'POPS web',
};

export function frameLabel(kind: FrameKind): string {
  return LABELS[kind];
}

export function isFrameKind(value: string): value is FrameKind {
  return FRAME_KINDS.includes(value as FrameKind);
}

/** A frame kind from a URL parameter; anything unrecognised means no frame. */
export function decodeFrame(raw: string | null | undefined): FrameKind {
  return raw !== null && raw !== undefined && isFrameKind(raw) ? raw : 'none';
}
