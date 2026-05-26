import { useMemo } from 'react';
import type { Building, EdgeType } from '../types/graph';
import { dijkstra } from '../utils/pathfinding';

interface PathfinderResult {
  path: string[] | null;
  error: string | null;
}

export function usePathfinder(
  building: Building,
  srcId: string | null,
  tgtId: string | null,
  excludedTypes: Set<EdgeType>,
): PathfinderResult {
  return useMemo(() => {
    if (!srcId || !tgtId) return { path: null, error: null };

    const path = dijkstra(building.nodes, building.edges, srcId, tgtId, excludedTypes);

    if (path === null) {
      const error =
        excludedTypes.size > 0 ? 'No accessible route found.' : 'No route found.';
      return { path: null, error };
    }

    return { path, error: null };
  }, [building.nodes, building.edges, srcId, tgtId, excludedTypes]);
}
