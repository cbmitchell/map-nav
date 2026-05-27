import { useMemo } from 'react';
import type { Building, EdgeType } from '../types/graph';
import { dijkstra, dijkstraToCategory } from '../utils/pathfinding';

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

    const path = tgtCategory
      ? dijkstraToCategory(building.nodes, building.edges, srcId, tgtCategory, excludedTypes)
      : dijkstra(building.nodes, building.edges, srcId, tgtId!, excludedTypes);

    if (path === null) {
      const error =
        excludedTypes.size > 0 ? 'No accessible route found.' : 'No route found.';
      return { path: null, error };
    }

    return { path, error: null };
  }, [building.nodes, building.edges, srcId, tgtId, tgtCategory, excludedTypes]);
}
