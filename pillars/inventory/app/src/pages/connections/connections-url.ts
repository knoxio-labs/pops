/** The server-side connection kinds understood by the registry page. */
export type ConnectionKind = 'all' | 'item' | 'fixture';

/** The two presentations of the connection registry. */
export type ConnectionView = 'list' | 'graph';

/** The URL-backed state owned by the Connections page. */
export interface ConnectionsUrlState {
  readonly q: string;
  readonly kind: ConnectionKind;
  readonly view: ConnectionView;
  readonly trace: string | null;
}

/** The default URL state, whose values are omitted from generated URLs. */
export const DEFAULT_CONNECTIONS_URL_STATE: ConnectionsUrlState = {
  q: '',
  kind: 'all',
  view: 'list',
  trace: null,
};

const MAX_QUERY_LENGTH = 200;

/** Returns whether a string is a supported server-side connection kind. */
export function isConnectionKind(value: string): value is ConnectionKind {
  return value === 'all' || value === 'item' || value === 'fixture';
}

/** Returns whether a string is a supported Connections page view. */
export function isConnectionView(value: string): value is ConnectionView {
  return value === 'list' || value === 'graph';
}

function readQuery(value: string | null): string {
  return (value ?? '').trim().slice(0, MAX_QUERY_LENGTH);
}

/** Parses the Connections page state from search parameters. */
export function parseConnectionsUrl(params: URLSearchParams): ConnectionsUrlState {
  const kindParam = params.get('kind');
  const viewParam = params.get('view');
  const trace = params.get('trace');
  return {
    q: readQuery(params.get('q')),
    kind: kindParam !== null && isConnectionKind(kindParam) ? kindParam : 'all',
    view: viewParam !== null && isConnectionView(viewParam) ? viewParam : 'list',
    trace: trace === null || trace.length === 0 ? null : trace,
  };
}

/** A partial URL update accepted by {@link writeConnectionsUrl}. */
export type ConnectionsUrlPatch = Partial<ConnectionsUrlState>;

/**
 * Applies only Connections-owned parameters and preserves all unrelated URL
 * parameters. Default values are removed instead of being serialized.
 */
export function writeConnectionsUrl(
  current: URLSearchParams,
  patch: ConnectionsUrlPatch
): URLSearchParams {
  const next = new URLSearchParams(current);

  if (patch.q !== undefined) {
    const query = readQuery(patch.q);
    if (query === '') next.delete('q');
    else next.set('q', query);
  }

  if (patch.kind !== undefined) {
    if (patch.kind === 'all') next.delete('kind');
    else next.set('kind', patch.kind);
  }

  if (patch.view !== undefined) {
    if (patch.view === 'list') next.delete('view');
    else next.set('view', patch.view);
  }

  if (patch.trace !== undefined) {
    if (patch.trace === null || patch.trace.length === 0) next.delete('trace');
    else next.set('trace', patch.trace);
  }

  return next;
}
