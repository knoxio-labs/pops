/**
 * What a thread points at.
 *
 * Three kinds, in the order the resolver prefers them. A `source` anchor is
 * the good case: the surface is stamped with its own file and line, so the
 * thread survives any amount of DOM churn and tells a session exactly where
 * to edit. A `token` anchor pins a row of the tokens sheet. A `selector`
 * anchor is the fallback for anything else — a CSS path plus the text that
 * was on screen, because the path alone collapses onto the wrong row the
 * moment a list re-renders.
 */
export type Anchor =
  | { kind: 'source'; source: string; tag: string; text: string }
  | { kind: 'token'; token: string; text: string }
  | { kind: 'selector'; selector: string; text: string };

export type AnchorKind = Anchor['kind'];
