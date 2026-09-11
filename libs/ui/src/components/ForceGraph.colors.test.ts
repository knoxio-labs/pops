import { describe, expect, it } from 'vitest';

import { GRAPH_COLORS } from '../theme/graph-colors';
import { FORCE_GRAPH_DEFAULT_COLORS } from './ForceGraph';

describe('FORCE_GRAPH_DEFAULT_COLORS', () => {
  it('reuses GRAPH_COLORS.node.default for the default node fill', () => {
    expect(FORCE_GRAPH_DEFAULT_COLORS.node).toBe(GRAPH_COLORS.node.default);
  });

  it('reuses GRAPH_COLORS.fallbacks.edge for the default edge colour', () => {
    expect(FORCE_GRAPH_DEFAULT_COLORS.edge).toBe(GRAPH_COLORS.fallbacks.edge);
  });

  it('reuses GRAPH_COLORS.fallbacks.label for the default label colour', () => {
    expect(FORCE_GRAPH_DEFAULT_COLORS.label).toBe(GRAPH_COLORS.fallbacks.label);
  });
});
