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
 * The marker (if any) that this node is currently standing in for as a resolved route
 * endpoint — used to override displayed label/styling in Navigator so the entrance
 * visually "becomes" the room it belongs to.
 */
export function findMarkerForEntrance(nodes: Node[], edges: Edge[], entranceId: string): Node | undefined {
  const edge = edges.find(
    (e) => e.type === ROOM_ENTRANCE_EDGE_TYPE && (e.srcId === entranceId || e.tgtId === entranceId),
  );
  if (!edge) return undefined;
  const otherId = edge.srcId === entranceId ? edge.tgtId : edge.srcId;
  const other = nodes.find((n) => n.id === otherId);
  return other?.isRoomMarker ? other : undefined;
}
