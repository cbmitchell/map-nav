import type { EdgeType, Node, Edge } from '../types/graph';

export const FIXED_WEIGHTS: Partial<Record<EdgeType, number>> = {
  stairs: 150,
  elevator: 300,
  bridge: 100,
};

/**
 * Dijkstra's shortest-path on the undirected building graph.
 * Returns an ordered array of node IDs, or null if no path exists.
 */
export function dijkstra(
  nodes: Node[],
  edges: Edge[],
  srcId: string,
  tgtId: string,
  excludedTypes: Set<EdgeType>,
): string[] | null {
  if (srcId === tgtId) {
    return nodes.some((n) => n.id === srcId) ? [srcId] : null;
  }

  // Build adjacency list (undirected)
  const adj = new Map<string, { neighborId: string; weight: number }[]>();
  for (const node of nodes) {
    adj.set(node.id, []);
  }
  for (const edge of edges) {
    if (excludedTypes.has(edge.type)) continue;
    adj.get(edge.srcId)?.push({ neighborId: edge.tgtId, weight: edge.weight });
    adj.get(edge.tgtId)?.push({ neighborId: edge.srcId, weight: edge.weight });
  }

  // Dijkstra with a simple sorted array as a priority queue
  // (office maps are small enough that O(n²) is fine)
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (const node of nodes) {
    dist.set(node.id, Infinity);
    prev.set(node.id, null);
    unvisited.add(node.id);
  }
  dist.set(srcId, 0);

  while (unvisited.size > 0) {
    // Pick unvisited node with smallest distance
    let u: string | null = null;
    let uDist = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity;
      if (d < uDist) {
        uDist = d;
        u = id;
      }
    }
    if (u === null || uDist === Infinity) break; // remaining nodes unreachable

    unvisited.delete(u);
    if (u === tgtId) break;

    for (const { neighborId, weight } of adj.get(u) ?? []) {
      if (!unvisited.has(neighborId)) continue;
      const alt = uDist + weight;
      if (alt < (dist.get(neighborId) ?? Infinity)) {
        dist.set(neighborId, alt);
        prev.set(neighborId, u);
      }
    }
  }

  // Reconstruct path
  if ((dist.get(tgtId) ?? Infinity) === Infinity) return null;

  const path: string[] = [];
  let cur: string | null = tgtId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path[0] === srcId ? path : null;
}
