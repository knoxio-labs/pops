/**
 * Turning a point on the canvas into an anchor, and an anchor back into an
 * element.
 *
 * The canvas is an iframe, so every function here takes the document to work
 * in rather than reaching for the global one — the overlay renders in the
 * shell's document and resolves against the frame's.
 */
import type { Anchor } from './anchors-types';

/** Marks overlay chrome, so a click on the panel never anchors to itself. */
export const OVERLAY_MARKER = 'data-pops-design-overlay';

const SOURCE_ATTRIBUTE = 'data-pops-design-source';
const TOKEN_ATTRIBUTE = 'data-pops-design-token';

const MAX_EXCERPT = 60;
const MAX_SELECTOR_DEPTH = 6;

export function excerpt(el: Element): string {
  return (el.textContent ?? '').trim().replace(/\s+/gu, ' ').slice(0, MAX_EXCERPT);
}

/**
 * A stable-enough CSS path for an element with no semantic anchor: the
 * nearest id wins outright, otherwise `tag:nth-of-type` segments up to six
 * levels. Paired with a text excerpt, because two rows of a list share a path
 * and only their text tells them apart.
 */
export function buildSelector(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  while (node && node.tagName !== 'BODY' && parts.length < MAX_SELECTOR_DEPTH) {
    if (node.id !== '') {
      parts.unshift(`#${node.id}`);
      return parts.join(' > ');
    }
    parts.unshift(nthOfTypeSegment(node));
    node = node.parentElement;
  }
  return parts.join(' > ');
}

function nthOfTypeSegment(node: Element): string {
  const tag = node.tagName.toLowerCase();
  const siblings = node.parentElement
    ? [...node.parentElement.children].filter((child) => child.tagName === node.tagName)
    : [];
  return siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(node) + 1})` : tag;
}

export interface Target {
  el: Element;
  anchor: Anchor;
}

function semanticTarget(el: Element): Target | null {
  const source = el.closest(`[${SOURCE_ATTRIBUTE}]`);
  const sourceValue = source?.getAttribute(SOURCE_ATTRIBUTE);
  if (source && sourceValue !== null && sourceValue !== undefined && sourceValue !== '') {
    return {
      el: source,
      anchor: {
        kind: 'source',
        source: sourceValue,
        tag: source.tagName.toLowerCase(),
        text: excerpt(source),
      },
    };
  }
  const token = el.closest(`[${TOKEN_ATTRIBUTE}]`);
  const tokenValue = token?.getAttribute(TOKEN_ATTRIBUTE);
  if (token && tokenValue !== null && tokenValue !== undefined && tokenValue !== '') {
    return { el: token, anchor: { kind: 'token', token: tokenValue, text: excerpt(token) } };
  }
  return null;
}

/**
 * The best anchor for a point in `doc`, or `null` when the point is on the
 * overlay's own chrome.
 */
export function findTarget(doc: Document, x: number, y: number): Target | null {
  for (const el of doc.elementsFromPoint(x, y)) {
    if (el.closest(`[${OVERLAY_MARKER}]`)) return null;
    const semantic = semanticTarget(el);
    if (semantic) return semantic;
    return { el, anchor: { kind: 'selector', selector: buildSelector(el), text: excerpt(el) } };
  }
  return null;
}

export function parseAnchor(thread: { anchorKind: string; anchor: string }): Anchor | null {
  try {
    const parsed: unknown = JSON.parse(thread.anchor);
    if (typeof parsed !== 'object' || parsed === null) return null;
    return { ...(parsed as object), kind: thread.anchorKind } as Anchor;
  } catch {
    return null;
  }
}

/**
 * Pick one element for a stored anchor.
 *
 * A repeated component shares one source stamp across every instance, so a
 * bare `querySelector` collapses them onto the first — every comment on a
 * list row would stack on row one. When several match, the one whose excerpt
 * matches what was on screen at comment time wins.
 */
function pick(doc: Document, selector: string, text: string): Element | null {
  let matches: Element[];
  try {
    matches = [...doc.querySelectorAll(selector)];
  } catch {
    return null;
  }
  if (matches.length <= 1) return matches[0] ?? null;
  return matches.find((el) => excerpt(el) === text) ?? matches[0] ?? null;
}

/** The live element a stored anchor points at in `doc`, if any. */
export function resolveAnchor(doc: Document, anchor: Anchor | null): Element | null {
  switch (anchor?.kind) {
    case 'source':
      return pick(doc, `[${SOURCE_ATTRIBUTE}="${anchor.source}"]`, anchor.text);
    case 'token':
      return pick(doc, `[${TOKEN_ATTRIBUTE}="${anchor.token}"]`, anchor.text);
    case 'selector':
      return pick(doc, anchor.selector, anchor.text);
    default:
      return null;
  }
}

/** A short human label for an anchor, shown on the thread in the panel. */
export function anchorLabel(anchor: Anchor | null): string {
  switch (anchor?.kind) {
    case 'source':
      return anchor.source;
    case 'token':
      return `token ${anchor.token}`;
    case 'selector':
      return anchor.text === '' ? anchor.selector : `“${anchor.text}”`;
    default:
      return 'unresolved';
  }
}
