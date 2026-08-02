import { useMemo } from 'react';
import type { Building, EdgeType } from '../types/graph';
import { dijkstraBetweenSets } from '../utils/pathfinding';
import { resolveRoomSelector, excludeRoomGroupMarkers } from '../utils/roomGroups';

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

    const routableNodes = excludeRoomGroupMarkers(building.nodes, building.roomGroups);
    const srcIds = resolveRoomSelector(building.roomGroups, srcId);
    const targetIds = tgtCategory
      ? new Set(building.nodes.filter((n) => n.isRoom && n.category === tgtCategory).map((n) => n.id))
      : new Set(resolveRoomSelector(building.roomGroups, tgtId!));

    const path = dijkstraBetweenSets(routableNodes, building.edges, srcIds, targetIds, excludedTypes);

    if (path === null) {
      const error =
        excludedTypes.size > 0 ? 'No accessible route found.' : 'No route found.';
      return { path: null, error };
    }

    return { path, error: null };
  }, [building.nodes, building.edges, building.roomGroups, srcId, tgtId, tgtCategory, excludedTypes]);
}
