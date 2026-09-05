import { describe, expect, it } from 'vitest';
import { layoutLineage } from './layout';

describe('layoutLineage', () => {
  it('is deterministic for the same graph', () => {
    const graph = {
      nodes: [
        { id: 'a', title: 'Root' },
        { id: 'b', title: 'Child' },
      ],
      edges: [{ from: 'a', to: 'b', relType: 'builds_on', evidenceState: 'verified' }],
    };
    const first = layoutLineage(graph);
    const second = layoutLineage(graph);
    expect(first).toEqual(second);
    expect(first.nodes).toHaveLength(2);
    expect(first.edges).toHaveLength(1);
    expect(first.edges[0]?.evidenceState).toBe('verified');
  });

  it('drops edges that reference missing nodes', () => {
    const layout = layoutLineage({
      nodes: [{ id: 'a', title: 'Only' }],
      edges: [{ from: 'a', to: 'missing', relType: 'cites' }],
    });
    expect(layout.edges).toHaveLength(0);
  });
});
