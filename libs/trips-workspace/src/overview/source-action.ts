import type { OverviewLinkKind, OverviewSource, TripOverviewProps } from './types';

/** Contextual opening takes precedence; legacy links are limited to previously published source pages. */
export function sourceAction(
  props: TripOverviewProps,
  source: OverviewSource
): { href?: string; onOpen?: () => void } {
  if (props.onOpenSource) return { onOpen: () => props.onOpenSource?.(source) };
  const kind = source.kind;
  return isLinkKind(kind) ? { href: props.href?.(kind, source.id) } : {};
}

function isLinkKind(kind: OverviewSource['kind']): kind is OverviewLinkKind {
  return (
    kind === 'visit' ||
    kind === 'stay' ||
    kind === 'event' ||
    kind === 'journey' ||
    kind === 'decision'
  );
}
