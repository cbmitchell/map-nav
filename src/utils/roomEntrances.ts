import type { Node, Edge } from '../types/graph';

// Never manually selectable — the editor auto-assigns this type whenever an edge
// touches a room marker node, and it's always excluded from pathfinding.
export const ROOM_ENTRANCE_EDGE_TYPE = 'room-entrance';

/** Ids of the nodes a room marker has "Room Entrance" edges to. */
export function getRoomEntranceIds(edges: Edge[], markerId: string): string[] {
  return edges
    .filter((e) => e.type === ROOM_ENTRANCE_EDGE_TYPE && (e.srcId === markerId || e.tgtId === markerId))
    .map((e) => (e.srcId === markerId ? e.tgtId : e.srcId));
}

/**
 * Expands a room selection into its real routing candidates: a plain room (or any
 * other node) resolves to itself; a room marker resolves to its entrances (possibly
 * none, if it has none yet).
 */
export function resolveRoomCandidates(nodes: Node[], edges: Edge[], id: string): string[] {
  const node = nodes.find((n) => n.id === id);
  if (!node?.isRoomMarker) return [id];
  return getRoomEntranceIds(edges, id);
}

/**
 * The marker (if any) that this already-resolved routing endpoint stands in for — used
 * to override displayed label/styling in Navigator so the entrance visually "becomes"
 * the room it belongs to. Takes the room id usePathfinder already determined this path
 * endpoint was resolved from (PathfinderResult.originRoomId/destinationRoomId), rather
 * than re-deriving it from the entrance's own edges — that's ambiguous whenever a
 * single entrance has Room Entrance edges to more than one marker.
 */
export function getImpersonatingMarker(nodes: Node[], roomId: string | null): Node | undefined {
  if (!roomId) return undefined;
  const node = nodes.find((n) => n.id === roomId);
  return node?.isRoomMarker ? node : undefined;
}
