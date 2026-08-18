import { describe, it, expect } from 'vitest';
import {
  ROOM_ENTRANCE_EDGE_TYPE,
  getRoomEntranceIds,
  resolveRoomCandidates,
  getImpersonatingMarker,
  getUnreachableMarkerIds,
} from './roomEntrances';
import type { Node, Edge } from '../types/graph';

function node(id: string, opts: Partial<Node> = {}): Node {
  return { id, sectionId: 's1', nx: 0, ny: 0, label: '', isRoom: false, isConnector: false, ...opts };
}

function entranceEdge(id: string, markerId: string, entranceId: string): Edge {
  return { id, srcId: markerId, tgtId: entranceId, type: ROOM_ENTRANCE_EDGE_TYPE, weight: 0, crossSection: false };
}

function walkway(id: string, srcId: string, tgtId: string): Edge {
  return { id, srcId, tgtId, type: 'walkway', weight: 10, crossSection: false };
}

describe('getRoomEntranceIds', () => {
  it('returns ids of nodes connected via Room Entrance edges', () => {
    const edges = [entranceEdge('e1', 'M', 'A'), entranceEdge('e2', 'M', 'B'), walkway('e3', 'A', 'Z')];
    expect(getRoomEntranceIds(edges, 'M')).toEqual(['A', 'B']);
  });

  it('returns an empty array for a marker with no entrances', () => {
    expect(getRoomEntranceIds([], 'M')).toEqual([]);
  });

  it('resolves the entrance id regardless of which side of the edge is the marker', () => {
    const edges = [{ id: 'e1', srcId: 'A', tgtId: 'M', type: ROOM_ENTRANCE_EDGE_TYPE, weight: 0, crossSection: false }];
    expect(getRoomEntranceIds(edges, 'M')).toEqual(['A']);
  });
});

describe('resolveRoomCandidates', () => {
  it('resolves a plain room (or any non-marker node) to itself', () => {
    const nodes = [node('A', { isRoom: true })];
    expect(resolveRoomCandidates(nodes, [], 'A')).toEqual(['A']);
  });

  it('resolves a marker to its entrance ids', () => {
    const nodes = [node('M', { isRoom: true, isRoomMarker: true }), node('A'), node('B')];
    const edges = [entranceEdge('e1', 'M', 'A'), entranceEdge('e2', 'M', 'B')];
    expect(resolveRoomCandidates(nodes, edges, 'M')).toEqual(['A', 'B']);
  });

  it('resolves a marker with no entrances to an empty array', () => {
    const nodes = [node('M', { isRoom: true, isRoomMarker: true })];
    expect(resolveRoomCandidates(nodes, [], 'M')).toEqual([]);
  });

  it('resolves an unknown id to itself', () => {
    expect(resolveRoomCandidates([], [], 'ghost')).toEqual(['ghost']);
  });
});

describe('getUnreachableMarkerIds', () => {
  it('flags a marker with zero Room Entrance edges', () => {
    const nodes = [node('M', { isRoom: true, isRoomMarker: true })];
    expect(getUnreachableMarkerIds(nodes, [])).toEqual(new Set(['M']));
  });

  it('does not flag a marker with at least one Room Entrance edge', () => {
    const nodes = [node('M', { isRoom: true, isRoomMarker: true }), node('A')];
    const edges = [entranceEdge('e1', 'M', 'A')];
    expect(getUnreachableMarkerIds(nodes, edges)).toEqual(new Set());
  });

  it('ignores non-marker nodes entirely', () => {
    const nodes = [node('A', { isRoom: true })];
    expect(getUnreachableMarkerIds(nodes, [])).toEqual(new Set());
  });
});

describe('getImpersonatingMarker', () => {
  it('returns the marker node for a matching room id', () => {
    const nodes = [node('M', { isRoom: true, isRoomMarker: true, label: 'Board Room' }), node('A')];
    expect(getImpersonatingMarker(nodes, 'M')?.id).toBe('M');
  });

  it('returns undefined for a room id that is not a marker', () => {
    const nodes = [node('A', { isRoom: true })];
    expect(getImpersonatingMarker(nodes, 'A')).toBeUndefined();
  });

  it('returns undefined for null', () => {
    expect(getImpersonatingMarker([], null)).toBeUndefined();
  });

  it('returns undefined for an unknown room id', () => {
    expect(getImpersonatingMarker([], 'ghost')).toBeUndefined();
  });
});
