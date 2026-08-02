import { useMemo } from 'react';
import type { Building, EdgeType } from '../types/graph';
import { dijkstraBetweenSets } from '../utils/pathfinding';
import { resolveRoomCandidates, ROOM_ENTRANCE_EDGE_TYPE } from '../utils/roomEntrances';

interface PathfinderResult {
  path: string[] | null;
  error: string | null;
}

export function usePathfinder(
  building: Building,
  srcId: string | null,
  tgtId: string | null,
  tgtCategory: string | null,
  excludedTypes: Set<EdgeType>,
): PathfinderResult {
  return useMemo(() => {
    if (!srcId || (!tgtId && !tgtCategory)) return { path: null, error: null };

    // Room Entrance edges are never routable, regardless of the accessibility toggle.
    const effectiveExcluded = new Set([...excludedTypes, ROOM_ENTRANCE_EDGE_TYPE]);

    const srcIds = resolveRoomCandidates(building.nodes, building.edges, srcId);
    const targetIds = tgtCategory
      ? new Set(
          building.nodes
            .filter((n) => n.isRoom && n.category === tgtCategory)
            .flatMap((n) => resolveRoomCandidates(building.nodes, building.edges, n.id)),
        )
      : new Set(resolveRoomCandidates(building.nodes, building.edges, tgtId!));

    const path = dijkstraBetweenSets(building.nodes, building.edges, srcIds, targetIds, effectiveExcluded);

    if (path === null) {
      const error =
        excludedTypes.size > 0 ? 'No accessible route found.' : 'No route found.';
      return { path: null, error };
    }

    return { path, error: null };
  }, [building.nodes, building.edges, srcId, tgtId, tgtCategory, excludedTypes]);
}
