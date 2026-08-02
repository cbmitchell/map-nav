import type { EdgeTypeDef, Node, Edge } from '../types/graph';
import { euclideanWeight } from './geometry';

export const DEFAULT_EDGE_TYPES: EdgeTypeDef[] = [
  {
    id: 'walkway',
    name: 'Walkway',
    color: '#378ADD',
    dashPattern: [],
    weightMode: 'length',
    fixedWeight: 100,
    lengthScalar: 1.0,
    isAccessible: true,
    isBuiltIn: true,
  },
  {
    id: 'stairs',
    name: 'Stairs',
    color: '#D85A30',
    dashPattern: [12, 6],
    weightMode: 'fixed',
    fixedWeight: 150,
    lengthScalar: 1.0,
    isAccessible: false,
    isBuiltIn: true,
  },
  {
    id: 'elevator',
    name: 'Elevator',
    color: '#534AB7',
    dashPattern: [4, 4],
    weightMode: 'fixed',
    fixedWeight: 300,
    lengthScalar: 1.0,
    isAccessible: true,
    isBuiltIn: true,
  },
  {
    id: 'ramp',
    name: 'Ramp',
    color: '#1D9E75',
    dashPattern: [12, 6],
    weightMode: 'length',
    fixedWeight: 100,
    lengthScalar: 1.0,
    isAccessible: true,
    isBuiltIn: true,
  },
];

export const CUSTOM_TYPE_COLORS = [
  '#E84393',
  '#00C8C8',
  '#FF6B35',
  '#7BC67E',
  '#9B59B6',
  '#F1C40F',
  '#E74C3C',
  '#2ECC71',
];

export function computeEdgeWeight(
  typeDef: EdgeTypeDef,
  src: Node,
  tgt: Node,
  canvasW: number,
  canvasH: number,
  scale = 1.0,
): number {
  if (typeDef.weightMode === 'fixed') return typeDef.fixedWeight;
  return euclideanWeight(src, tgt, canvasW, canvasH) * typeDef.lengthScalar * scale;
}

// ---------------------------------------------------------------------------
// Shared Dijkstra core
// ---------------------------------------------------------------------------

function buildAdjacency(
  nodes: Node[],
  edges: Edge[],
  excludedTypes: Set<string>,
): Map<string, { neighborId: string; weight: number }[]> {
  const adj = new Map<string, { neighborId: string; weight: number }[]>();
  for (const node of nodes) adj.set(node.id, []);
  for (const edge of edges) {
    if (excludedTypes.has(edge.type)) continue;
    adj.get(edge.srcId)?.push({ neighborId: edge.tgtId, weight: edge.weight });
    adj.get(edge.tgtId)?.push({ neighborId: edge.srcId, weight: edge.weight });
  }
  return adj;
}

// Office maps are small so the O(n²) min-extract is acceptable.
function runDijkstra(
  nodes: Node[],
  adj: Map<string, { neighborId: string; weight: number }[]>,
  srcId: string,
  isTarget: (id: string) => boolean,
): string[] | null {
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (const node of nodes) {
    dist.set(node.id, Infinity);
    prev.set(node.id, null);
    unvisited.add(node.id);
  }
  dist.set(srcId, 0);

  let resolvedTgtId: string | null = null;

  while (unvisited.size > 0) {
    let u: string | null = null;
    let uDist = Infinity;
    for (const id of unvisited) {
      const d = dist.get(id) ?? Infinity;
      if (d < uDist) { uDist = d; u = id; }
    }
    if (u === null || uDist === Infinity) break;

    unvisited.delete(u);

    if (isTarget(u)) {
      resolvedTgtId = u;
      break;
    }

    for (const { neighborId, weight } of adj.get(u) ?? []) {
      if (!unvisited.has(neighborId)) continue;
      const alt = uDist + weight;
      if (alt < (dist.get(neighborId) ?? Infinity)) {
        dist.set(neighborId, alt);
        prev.set(neighborId, u);
      }
    }
  }

  if (!resolvedTgtId) return null;

  const path: string[] = [];
  let cur: string | null = resolvedTgtId;
  while (cur !== null) {
    path.unshift(cur);
    cur = prev.get(cur) ?? null;
  }
  return path[0] === srcId ? path : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Dijkstra's shortest-path on the undirected building graph.
 * Returns an ordered array of node IDs, or null if no path exists.
 */
export function dijkstra(
  nodes: Node[],
  edges: Edge[],
  srcId: string,
  tgtId: string,
  excludedTypes: Set<string>,
): string[] | null {
  if (srcId === tgtId) {
    return nodes.some((n) => n.id === srcId) ? [srcId] : null;
  }
  const adj = buildAdjacency(nodes, edges, excludedTypes);
  return runDijkstra(nodes, adj, srcId, (id) => id === tgtId);
}

/**
 * Finds the shortest path from srcId to the nearest room whose category matches
 * the given string. Returns an ordered array of node IDs, or null if no such
 * reachable room exists.
 */
export function dijkstraToCategory(
  nodes: Node[],
  edges: Edge[],
  srcId: string,
  category: string,
  excludedTypes: Set<string>,
): string[] | null {
  const categoryNodeIds = new Set(
    nodes.filter((n) => n.isRoom && n.category === category).map((n) => n.id),
  );
  if (categoryNodeIds.size === 0) return null;

  const adj = buildAdjacency(nodes, edges, excludedTypes);
  return runDijkstra(nodes, adj, srcId, (id) => categoryNodeIds.has(id));
}
