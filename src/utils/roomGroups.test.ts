import { describe, it, expect } from 'vitest';
import {
  ROOM_GROUP_PREFIX,
  resolveRoomSelector,
  collectRoomGroupMarkerIds,
  collectSuppressedRoomMembers,
  findRoomGroupForNode,
  excludeRoomGroupMarkers,
} from './roomGroups';
import type { Node, RoomGroup } from '../types/graph';

function node(id: string, opts: Partial<Node> = {}): Node {
  return { id, sectionId: 's1', nx: 0, ny: 0, label: '', isRoom: false, isConnector: false, ...opts };
}

function group(id: string, opts: Partial<RoomGroup> = {}): RoomGroup {
  return { id, name: id, nodeIds: [], ...opts };
}

describe('resolveRoomSelector', () => {
  it('resolves a plain node id to itself', () => {
    const groups = [group('g1', { nodeIds: ['A', 'B'] })];
    expect(resolveRoomSelector(groups, 'A')).toEqual(['A']);
  });

  it('resolves a room-group selector to its member ids', () => {
    const groups = [group('g1', { nodeIds: ['A', 'B'] })];
    expect(resolveRoomSelector(groups, `${ROOM_GROUP_PREFIX}g1`)).toEqual(['A', 'B']);
  });

  it('returns an empty array for an unknown room-group selector', () => {
    expect(resolveRoomSelector([], `${ROOM_GROUP_PREFIX}ghost`)).toEqual([]);
  });
});

describe('collectRoomGroupMarkerIds', () => {
  it('collects marker ids only from groups that have one', () => {
    const groups = [
      group('g1', { markerNodeId: 'M1' }),
      group('g2'),
      group('g3', { markerNodeId: 'M3' }),
    ];
    expect(collectRoomGroupMarkerIds(groups)).toEqual(new Set(['M1', 'M3']));
  });
});

describe('collectSuppressedRoomMembers', () => {
  it('suppresses members only for groups with a marker', () => {
    const groups = [
      group('g1', { nodeIds: ['A', 'B'], markerNodeId: 'M1' }),
      group('g2', { nodeIds: ['C', 'D'] }), // no marker — not suppressed
    ];
    expect(collectSuppressedRoomMembers(groups)).toEqual(new Set(['A', 'B']));
  });
});

describe('findRoomGroupForNode', () => {
  it('finds the group a member node belongs to', () => {
    const groups = [group('g1', { nodeIds: ['A', 'B'] })];
    expect(findRoomGroupForNode(groups, 'A')?.id).toBe('g1');
  });

  it('finds the group a marker node belongs to', () => {
    const groups = [group('g1', { markerNodeId: 'M1' })];
    expect(findRoomGroupForNode(groups, 'M1')?.id).toBe('g1');
  });

  it('returns undefined for an ungrouped node', () => {
    const groups = [group('g1', { nodeIds: ['A'] })];
    expect(findRoomGroupForNode(groups, 'Z')).toBeUndefined();
  });
});

describe('excludeRoomGroupMarkers', () => {
  it('filters out marker nodes, leaving other nodes untouched', () => {
    const nodes = [node('A'), node('Marker'), node('B')];
    const groups = [group('g1', { nodeIds: ['A', 'B'], markerNodeId: 'Marker' })];
    expect(excludeRoomGroupMarkers(nodes, groups).map((n) => n.id)).toEqual(['A', 'B']);
  });

  it('returns the same nodes when there are no markers', () => {
    const nodes = [node('A'), node('B')];
    expect(excludeRoomGroupMarkers(nodes, [])).toEqual(nodes);
  });
});
