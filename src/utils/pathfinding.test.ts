import { describe, it, expect } from 'vitest';
import { dijkstraBetweenSets } from './pathfinding';
import type { Node, Edge } from '../types/graph';

// ---------------------------------------------------------------------------
// Test graph helpers
// ---------------------------------------------------------------------------

function node(id: string, opts: Partial<Node> = {}): Node {
  return { id, sectionId: 's1', nx: 0, ny: 0, label: '', isRoom: false, isConnector: false, ...opts };
}

function edge(id: string, srcId: string, tgtId: string, weight: number, type: Edge['type'] = 'walkway'): Edge {
  return { id, srcId, tgtId, type, weight, crossSection: false };
}

// dijkstraBetweenSets is the sole entry point into the pathfinder now — usePathfinder
// resolves both plain rooms and room-marker entrance sets into srcIds/targetIds before
// calling it, so a single srcId/single targetId is just the one-element-set case.

describe('dijkstraBetweenSets — single source, single target', () => {
  it('returns a single-node path when src === tgt', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B', 10)];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['A']), new Set())).toEqual(['A']);
  });

  it('returns null when the source/target node does not exist in the graph', () => {
    const nodes = [node('A')];
    expect(dijkstraBetweenSets(nodes, [], ['ghost'], new Set(['ghost']), new Set())).toBeNull();
  });

  it('finds a simple linear path A → B → C', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B', 1), edge('e2', 'B', 'C', 1)];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['C']), new Set())).toEqual(['A', 'B', 'C']);
  });

  it('traverses edges in reverse direction (graph is undirected)', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'B', 'A', 1), edge('e2', 'C', 'B', 1)];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['C']), new Set())).toEqual(['A', 'B', 'C']);
  });

  it('chooses the lower-weight path when two routes exist', () => {
    //  A --1-- B --1-- D   (cost 2)
    //  A -----10------ D   (cost 10)
    const nodes = [node('A'), node('B'), node('D')];
    const edges = [
      edge('e1', 'A', 'B', 1),
      edge('e2', 'B', 'D', 1),
      edge('e3', 'A', 'D', 10),
    ];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['D']), new Set())).toEqual(['A', 'B', 'D']);
  });

  it('returns null when no path exists', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B', 1)]; // C is disconnected
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['C']), new Set())).toBeNull();
  });

  it('returns null when the only path uses an excluded edge type', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B', 150, 'stairs')];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['B']), new Set(['stairs']))).toBeNull();
  });

  it('routes around excluded types when an alternative exists', () => {
    //  A --stairs-- B   (excluded)
    //  A --walkway--C--walkway-- B
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [
      edge('e1', 'A', 'B', 150, 'stairs'),
      edge('e2', 'A', 'C', 10, 'walkway'),
      edge('e3', 'C', 'B', 10, 'walkway'),
    ];
    const path = dijkstraBetweenSets(nodes, edges, ['A'], new Set(['B']), new Set(['stairs']));
    expect(path).toEqual(['A', 'C', 'B']);
  });

  it('handles cross-section edges correctly (treated as normal edges)', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D')];
    const crossEdge: Edge = { id: 'cross', srcId: 'B', tgtId: 'C', type: 'elevator', weight: 300, crossSection: true };
    const edges = [
      edge('e1', 'A', 'B', 10),
      crossEdge,
      edge('e2', 'C', 'D', 10),
    ];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['D']), new Set())).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns null when cross-section edge type is excluded', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D')];
    const crossEdge: Edge = { id: 'cross', srcId: 'B', tgtId: 'C', type: 'elevator', weight: 300, crossSection: true };
    const edges = [edge('e1', 'A', 'B', 10), crossEdge, edge('e2', 'C', 'D', 10)];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['D']), new Set(['elevator']))).toBeNull();
  });
});

describe('dijkstraBetweenSets — category-style routing (single source, several candidate targets)', () => {
  it('routes to the nearest room in the category', () => {
    //  A --1-- B(bathroom, dist=1)
    //  A --5-- C(bathroom, dist=5)
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B', 1), edge('e2', 'A', 'C', 5)];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['B', 'C']), new Set())).toEqual(['A', 'B']);
  });

  it('routes to farther room when nearer one is unreachable due to excluded type', () => {
    //  A --stairs-- B(bathroom)
    //  A --walkway--C(bathroom)
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [
      edge('e1', 'A', 'B', 1, 'stairs'),
      edge('e2', 'A', 'C', 5, 'walkway'),
    ];
    const path = dijkstraBetweenSets(nodes, edges, ['A'], new Set(['B', 'C']), new Set(['stairs']));
    expect(path).toEqual(['A', 'C']);
  });

  it('returns null when no candidate target is reachable', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B', 1)]; // C is disconnected
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['C']), new Set())).toBeNull();
  });

  it('returns single-node path when src itself is a candidate target', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B', 1)];
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(['A']), new Set())).toEqual(['A']);
  });
});

describe('dijkstraBetweenSets — multi-entrance rooms', () => {
  it('routes to the nearest of several target entrances', () => {
    //  A --1-- Door1
    //  A --5-- Door2
    const nodes = [node('A'), node('Door1'), node('Door2')];
    const edges = [edge('e1', 'A', 'Door1', 1), edge('e2', 'A', 'Door2', 5)];
    const path = dijkstraBetweenSets(nodes, edges, ['A'], new Set(['Door1', 'Door2']), new Set());
    expect(path).toEqual(['A', 'Door1']);
  });

  it('routes from the nearest of several origin entrances', () => {
    //  Door1 --5-- Z
    //  Door2 --1-- Z
    const nodes = [node('Door1'), node('Door2'), node('Z')];
    const edges = [edge('e1', 'Door1', 'Z', 5), edge('e2', 'Door2', 'Z', 1)];
    const path = dijkstraBetweenSets(nodes, edges, ['Door1', 'Door2'], new Set(['Z']), new Set());
    expect(path).toEqual(['Door2', 'Z']);
  });

  it('picks the cheapest pair when both origin and destination are multi-entrance', () => {
    //  A1 --1-- B1   (cost 1, cheapest)
    //  A1 --9-- B2
    //  A2 --9-- B1
    //  A2 --9-- B2
    const nodes = [node('A1'), node('A2'), node('B1'), node('B2')];
    const edges = [
      edge('e1', 'A1', 'B1', 1),
      edge('e2', 'A1', 'B2', 9),
      edge('e3', 'A2', 'B1', 9),
      edge('e4', 'A2', 'B2', 9),
    ];
    const path = dijkstraBetweenSets(nodes, edges, ['A1', 'A2'], new Set(['B1', 'B2']), new Set());
    expect(path).toEqual(['A1', 'B1']);
  });

  it('returns null when srcIds or targetIds is empty', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B', 1)];
    expect(dijkstraBetweenSets(nodes, edges, [], new Set(['B']), new Set())).toBeNull();
    expect(dijkstraBetweenSets(nodes, edges, ['A'], new Set(), new Set())).toBeNull();
  });
});
