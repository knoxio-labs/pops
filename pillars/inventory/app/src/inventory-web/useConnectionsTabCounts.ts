import { useConnectionsRegistry } from './useConnectionsRegistry.js';
import { useFixtures } from './useFixtures.js';

/** Returns unfiltered Connections and Fixtures counts, or null while each query is unloaded. */
export function useConnectionsTabCounts(): {
  connections: number | null;
  fixtures: number | null;
} {
  const connections = useConnectionsRegistry({ kind: 'all', q: '' });
  const fixtures = useFixtures({ search: '', type: null, withinLocationId: null });
  return {
    connections: connections.summary?.connections ?? null,
    fixtures: fixtures.total,
  };
}
