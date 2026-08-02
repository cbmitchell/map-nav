import type { Node, RoomGroup } from '../types/graph';

// A room-group selector (used to represent "any entrance of this room" as a single
// origin/destination choice) is encoded as this prefix + the RoomGroup's id,
// distinguishing it from a real node id wherever such a selector is passed around.
export const ROOM_GROUP_PREFIX = 'roomgroup:';

/**
 * Expands a selector into the concrete node ids it refers to: a real node id resolves
 * to itself; a "roomgroup:<id>" selector resolves to that group's member entrance ids
 * (never its marker, which is excluded from pathfinding entirely).
 */
export function resolveRoomSelector(roomGroups: RoomGroup[], id: string): string[] {
  if (id.startsWith(ROOM_GROUP_PREFIX)) {
    const groupId = id.slice(ROOM_GROUP_PREFIX.length);
    return roomGroups.find((g) => g.id === groupId)?.nodeIds ?? [];
  }
  return [id];
}

/** Every room group's display-only marker node id, if it has one. */
export function collectRoomGroupMarkerIds(roomGroups: RoomGroup[]): Set<string> {
  return new Set(roomGroups.map((g) => g.markerNodeId).filter((id): id is string => !!id));
}

/**
 * Member node ids whose group has a marker — such nodes are hidden from Navigator's
 * room browsing/selection UI in favor of the marker (see callers for when this
 * suppression should and shouldn't be applied).
 */
export function collectSuppressedRoomMembers(roomGroups: RoomGroup[]): Set<string> {
  const suppressed = new Set<string>();
  for (const g of roomGroups) {
    if (g.markerNodeId) {
      for (const id of g.nodeIds) suppressed.add(id);
    }
  }
  return suppressed;
}

/** The room group (if any) that a node belongs to, either as a member or its marker. */
export function findRoomGroupForNode(roomGroups: RoomGroup[], nodeId: string): RoomGroup | undefined {
  return roomGroups.find((g) => g.markerNodeId === nodeId || g.nodeIds.includes(nodeId));
}

/** Filters out any node acting as a room group's display-only marker. */
export function excludeRoomGroupMarkers(nodes: Node[], roomGroups: RoomGroup[]): Node[] {
  const markerIds = collectRoomGroupMarkerIds(roomGroups);
  return markerIds.size === 0 ? nodes : nodes.filter((n) => !markerIds.has(n.id));
}
