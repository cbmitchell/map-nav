import { useMemo } from 'react';
import type { Building, EdgeType } from '../types/graph';
import { dijkstraBetweenSets } from '../utils/pathfinding';
import { resolveRoomCandidates, ROOM_ENTRANCE_EDGE_TYPE } from '../utils/roomEntrances';

interface PathfinderResult {
  path: string[] | null;
  error: string | null;
  // The originally-selected room (marker or plain room) each path endpoint resolved
  // from — lets consumers recover which specific room a route's endpoint represents
  // without re-deriving it from the entrance node's edges, which would be ambiguous if
  // that entrance happens to be shared by more than one room marker.
  originRoomId: string | null;
  destinationRoomId: string | null;
}

const EMPTY_RESULT: PathfinderResult = { path: null, error: null, originRoomId: null, destinationRoomId: null };

export function usePathfinder(
  building: Building,
  srcId: string | null,
  tgtId: string | null,
  tgtCategory: string | null,
  excludedTypes: Set<EdgeType>,
): PathfinderResult {
  return useMemo(() => {
    if (!srcId || (!tgtId && !tgtCategory)) return EMPTY_RESULT;

    // Room Entrance edges are never routable, regardless of the accessibility toggle.
    const effectiveExcluded = new Set([...excludedTypes, ROOM_ENTRANCE_EDGE_TYPE]);

    // Map each candidate entrance id back to whichever originally-selected room it
    // came from, so a path endpoint can be attributed to a specific room unambiguously
    // — even when an entrance has Room Entrance edges to more than one marker.
    const srcIds = resolveRoomCandidates(building.nodes, building.edges, srcId);
    const srcOriginById = new Map(srcIds.map((id) => [id, srcId]));

    const tgtOriginById = new Map<string, string>();
    if (tgtCategory) {
      for (const room of building.nodes) {
        if (!room.isRoom || room.category !== tgtCategory) continue;
        for (const id of resolveRoomCandidates(building.nodes, building.edges, room.id)) {
          tgtOriginById.set(id, room.id);
        }
      }
    } else {
      for (const id of resolveRoomCandidates(building.nodes, building.edges, tgtId!)) {
        tgtOriginById.set(id, tgtId!);
      }
    }
    const targetIds = new Set(tgtOriginById.keys());

    const path = dijkstraBetweenSets(building.nodes, building.edges, srcIds, targetIds, effectiveExcluded);

    if (path === null) {
      const error = excludedTypes.size > 0 ? 'No accessible route found.' : 'No route found.';
      return { path: null, error, originRoomId: null, destinationRoomId: null };
    }

    return {
      path,
      error: null,
      originRoomId: srcOriginById.get(path[0]) ?? null,
      destinationRoomId: tgtOriginById.get(path[path.length - 1]) ?? null,
    };
  }, [building.nodes, building.edges, srcId, tgtId, tgtCategory, excludedTypes]);
}
