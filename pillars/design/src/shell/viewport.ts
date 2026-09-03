import { decodeFrame, type FrameKind } from '../frames/kind';
import { decodeTheme, encodeTheme, type CanvasTheme } from './theme';

export type Viewport =
  | { kind: 'full' }
  | { kind: 'fixed'; label: string; w: number; h: number }
  | { kind: 'ratio'; label: string; rw: number; rh: number };

export const FULL: Viewport = { kind: 'full' };

export const VIEWPORT_PRESETS: Viewport[] = [
  FULL,
  { kind: 'fixed', label: 'Phone', w: 390, h: 844 },
  { kind: 'fixed', label: 'Tablet', w: 820, h: 1180 },
  { kind: 'fixed', label: 'Laptop', w: 1280, h: 800 },
  { kind: 'ratio', label: '16:9', rw: 16, rh: 9 },
  { kind: 'ratio', label: '4:3', rw: 4, rh: 3 },
  { kind: 'ratio', label: '1:1', rw: 1, rh: 1 },
];

export function viewportLabel(viewport: Viewport): string {
  if (viewport.kind === 'full') return 'Full';
  if (viewport.kind === 'ratio') return viewport.label;
  return `${viewport.label} ${viewport.w}×${viewport.h}`;
}

export function rotated(viewport: Viewport): Viewport {
  if (viewport.kind === 'fixed') return { ...viewport, w: viewport.h, h: viewport.w };
  if (viewport.kind === 'ratio') return { ...viewport, rw: viewport.rh, rh: viewport.rw };
  return viewport;
}

/** Pixel size for a sized viewport given the available canvas area (CSS px). */
export function frameSize(
  viewport: Exclude<Viewport, { kind: 'full' }>,
  avail: { w: number; h: number }
): { w: number; h: number } {
  if (viewport.kind === 'fixed') return { w: viewport.w, h: viewport.h };
  const scale = Math.min(avail.w / viewport.rw, avail.h / viewport.rh);
  return { w: Math.round(viewport.rw * scale), h: Math.round(viewport.rh * scale) };
}

/**
 * Frame ↔ shell messages (same-origin postMessage). The canvas is always an
 * iframe, so this is the only channel between the chrome and the surface:
 * the frame reports where it navigated and how many threads are open there,
 * the shell pushes theme changes and whether comment mode is on.
 *
 * The comment overlay lives INSIDE the frame rather than over it. Anchoring
 * is a hit test against the surface's own document, and an overlay in the
 * chrome would have to undo the frame's scale and offset to run one — with
 * every scroll and resize a chance to drift. The cost is this pair of
 * messages, which is the smaller thing to keep correct.
 */
export type FrameToShell =
  | { kind: 'route'; route: string }
  | { kind: 'ready' }
  | { kind: 'comment-count'; open: number }
  | { kind: 'comments-exit' }
  // A pointer went down on the surface. The canvas is an iframe, so that
  // press produces no event in the shell's document at all — which is why a
  // dock popover stayed open when you clicked "outside" it onto the design.
  // Radix cannot see across the boundary; this message is the crossing.
  | { kind: 'pointerdown' };

export type ShellToFrame =
  | { kind: 'theme'; theme: CanvasTheme }
  | { kind: 'comments'; active: boolean }
  | { kind: 'frame'; frame: FrameKind };

export const FRAME_PREFIX = '/frame';
const THEME_PARAM = 'theme';
const FRAME_PARAM = 'frame';

/**
 * The frame URL for a shell route (`pathname + search`, router-relative),
 * carrying the initial theme and product chrome as query parameters. Later
 * changes to either go over postMessage so the frame never reloads for them;
 * the parameters are what a route change reloads *into*.
 */
export function toFrameRoute(route: string, theme: CanvasTheme, frame: FrameKind): string {
  const url = new URL(route, 'http://frame.invalid');
  url.searchParams.set(THEME_PARAM, encodeTheme(theme));
  url.searchParams.set(FRAME_PARAM, frame);
  return `${FRAME_PREFIX}${url.pathname}${url.search}`;
}

/** The shell route a frame location corresponds to: prefix and chrome params removed. */
export function fromFrameRoute(pathname: string, search = ''): string {
  const path = pathname.startsWith(FRAME_PREFIX) ? pathname.slice(FRAME_PREFIX.length) : pathname;
  const params = new URLSearchParams(search);
  params.delete(THEME_PARAM);
  params.delete(FRAME_PARAM);
  const query = params.toString();
  return query ? `${path}?${query}` : path;
}

/** The theme a frame was opened with. */
export function themeFromSearch(search: string): CanvasTheme {
  return decodeTheme(new URLSearchParams(search).get(THEME_PARAM));
}

/** The product chrome a frame was opened with. */
export function frameFromSearch(search: string): FrameKind {
  return decodeFrame(new URLSearchParams(search).get(FRAME_PARAM));
}
