import { describe, it, expect } from 'vitest';
import { reducer } from './useGraphReducer';
import { DEFAULT_EDGE_TYPES } from '../utils/pathfinding';
import type { Building, Node, Edge, Section } from '../types/graph';

function section(id: string, opts: Partial<Section> = {}): Section {
  return { id, name: id, floor: 1, imageData: '', imageW: 1000, imageH: 1000, ...opts };
}

function node(id: string, sectionId: string, opts: Partial<Node> = {}): Node {
  return { id, sectionId, nx: 0, ny: 0, label: '', isRoom: false, isConnector: false, ...opts };
}

function building(sections: Section[], nodes: Node[], edges: Edge[]): Building {
  return { name: 'Test', sections, nodes, edges, edgeTypes: DEFAULT_EDGE_TYPES };
}

describe('cross-section edge weights', () => {
  // A cross-section connector edge's two endpoints are normalized against different
  // section images — euclidean distance between their nx/ny is meaningless. Both
  // recompute sites must leave the weight untouched rather than corrupt it.

  it('UPDATE_NODE does not recompute a cross-section edge weight on drag', () => {
    const sections = [section('s1'), section('s2')];
    const nodes = [
      node('a', 's1', { nx: 0.1, ny: 0.1, isConnector: true }),
      node('b', 's2', { nx: 0.9, ny: 0.9, isConnector: true }),
    ];
    const edges: Edge[] = [{ id: 'e1', srcId: 'a', tgtId: 'b', type: 'walkway', weight: 100, crossSection: true }];
    const state = building(sections, nodes, edges);

    const next = reducer(state, { type: 'UPDATE_NODE', payload: { id: 'a', nx: 0.5, ny: 0.5 } });

    expect(next.edges[0].weight).toBe(100);
  });

  it('UPDATE_EDGE does not recompute a cross-section edge weight on type change', () => {
    const sections = [section('s1'), section('s2')];
    const nodes = [node('a', 's1', { isConnector: true }), node('b', 's2', { isConnector: true })];
    const edges: Edge[] = [{ id: 'e1', srcId: 'a', tgtId: 'b', type: 'walkway', weight: 100, crossSection: true }];
    const state = building(sections, nodes, edges);

    const next = reducer(state, { type: 'UPDATE_EDGE', payload: { id: 'e1', type: 'ramp' } });

    expect(next.edges[0].type).toBe('ramp');
    expect(next.edges[0].weight).toBe(100);
  });

  it('UPDATE_NODE still recomputes a same-section length-mode edge weight on drag', () => {
    const sections = [section('s1')];
    const nodes = [node('a', 's1', { nx: 0, ny: 0 }), node('b', 's1', { nx: 0, ny: 0 })];
    const edges: Edge[] = [{ id: 'e1', srcId: 'a', tgtId: 'b', type: 'walkway', weight: 0, crossSection: false }];
    const state = building(sections, nodes, edges);

    const next = reducer(state, { type: 'UPDATE_NODE', payload: { id: 'a', nx: 1, ny: 0 } });

    expect(next.edges[0].weight).toBeGreaterThan(0);
  });
});

describe('UNSET_ROOM_MARKER', () => {
  it('reverts a Room Entrance edge to the walkway type\'s actual weight mode, not a hardcoded length formula', () => {
    const sections = [section('s1')];
    const nodes = [
      node('m', 's1', { isRoom: true, isRoomMarker: true }),
      node('a', 's1', { nx: 1, ny: 0 }),
    ];
    const edges: Edge[] = [{ id: 'e1', srcId: 'm', tgtId: 'a', type: 'room-entrance', weight: 0, crossSection: false }];
    const edgeTypes = DEFAULT_EDGE_TYPES.map((t) =>
      t.id === 'walkway' ? { ...t, weightMode: 'fixed' as const, fixedWeight: 42 } : t,
    );
    const state: Building = { name: 'Test', sections, nodes, edges, edgeTypes };

    const next = reducer(state, { type: 'UNSET_ROOM_MARKER', payload: { nodeId: 'm' } });

    expect(next.edges[0].type).toBe('walkway');
    expect(next.edges[0].weight).toBe(42);
  });
});
