import { describe, it, expect } from 'vitest';
import { dijkstra, dijkstraToCategory } from './pathfinding';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('dijkstra', () => {
  it('returns a single-node path when src === tgt', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B', 10)];
    expect(dijkstra(nodes, edges, 'A', 'A', new Set())).toEqual(['A']);
  });

  it('returns null when src === tgt but the node does not exist in the graph', () => {
    const nodes = [node('A')];
    expect(dijkstra(nodes, [], 'ghost', 'ghost', new Set())).toBeNull();
  });

  it('finds a simple linear path A → B → C', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B', 1), edge('e2', 'B', 'C', 1)];
    expect(dijkstra(nodes, edges, 'A', 'C', new Set())).toEqual(['A', 'B', 'C']);
  });

  it('traverses edges in reverse direction (graph is undirected)', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'B', 'A', 1), edge('e2', 'C', 'B', 1)];
    expect(dijkstra(nodes, edges, 'A', 'C', new Set())).toEqual(['A', 'B', 'C']);
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
    expect(dijkstra(nodes, edges, 'A', 'D', new Set())).toEqual(['A', 'B', 'D']);
  });

  it('returns null when no path exists', () => {
    const nodes = [node('A'), node('B'), node('C')];
    const edges = [edge('e1', 'A', 'B', 1)]; // C is disconnected
    expect(dijkstra(nodes, edges, 'A', 'C', new Set())).toBeNull();
  });

  it('returns null when the only path uses an excluded edge type', () => {
    const nodes = [node('A'), node('B')];
    const edges = [edge('e1', 'A', 'B', 150, 'stairs')];
    expect(dijkstra(nodes, edges, 'A', 'B', new Set(['stairs']))).toBeNull();
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
    const path = dijkstra(nodes, edges, 'A', 'B', new Set(['stairs']));
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
    expect(dijkstra(nodes, edges, 'A', 'D', new Set())).toEqual(['A', 'B', 'C', 'D']);
  });

  it('returns null when cross-section edge type is excluded', () => {
    const nodes = [node('A'), node('B'), node('C'), node('D')];
    const crossEdge: Edge = { id: 'cross', srcId: 'B', tgtId: 'C', type: 'elevator', weight: 300, crossSection: true };
    const edges = [edge('e1', 'A', 'B', 10), crossEdge, edge('e2', 'C', 'D', 10)];
    expect(dijkstra(nodes, edges, 'A', 'D', new Set(['elevator']))).toBeNull();
  });
});

describe('dijkstraToCategory', () => {
  it('routes to the nearest room in the category', () => {
    //  A --1-- B(bathroom, dist=1)
    //  A --5-- C(bathroom, dist=5)
    const nodes = [
      node('A'),
      node('B', { isRoom: true, category: 'bathroom' }),
      node('C', { isRoom: true, category: 'bathroom' }),
    ];
    const edges = [edge('e1', 'A', 'B', 1), edge('e2', 'A', 'C', 5)];
    expect(dijkstraToCategory(nodes, edges, 'A', 'bathroom', new Set())).toEqual(['A', 'B']);
  });

  it('routes to farther room when nearer one is unreachable due to excluded type', () => {
    //  A --stairs-- B(bathroom)
    //  A --walkway--C(bathroom)
    const nodes = [
      node('A'),
      node('B', { isRoom: true, category: 'bathroom' }),
      node('C', { isRoom: true, category: 'bathroom' }),
    ];
    const edges = [
      edge('e1', 'A', 'B', 1, 'stairs'),
      edge('e2', 'A', 'C', 5, 'walkway'),
    ];
    const path = dijkstraToCategory(nodes, edges, 'A', 'bathroom', new Set(['stairs']));
    expect(path).toEqual(['A', 'C']);
  });

  it('returns null when no room with the given category exists', () => {
    const nodes = [node('A'), node('B', { isRoom: true, category: 'kitchen' })];
    const edges = [edge('e1', 'A', 'B', 1)];
    expect(dijkstraToCategory(nodes, edges, 'A', 'bathroom', new Set())).toBeNull();
  });

  it('returns null when no room with the category is reachable', () => {
    const nodes = [node('A'), node('B'), node('C', { isRoom: true, category: 'bathroom' })];
    const edges = [edge('e1', 'A', 'B', 1)]; // C is disconnected
    expect(dijkstraToCategory(nodes, edges, 'A', 'bathroom', new Set())).toBeNull();
  });

  it('returns single-node path when src itself has the target category', () => {
    const nodes = [node('A', { isRoom: true, category: 'bathroom' }), node('B')];
    const edges = [edge('e1', 'A', 'B', 1)];
    expect(dijkstraToCategory(nodes, edges, 'A', 'bathroom', new Set())).toEqual(['A']);
  });
});
