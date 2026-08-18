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
  {
    // Never manually selectable — the editor auto-assigns this type whenever an edge
    // touches a room marker node. Always excluded from pathfinding (see
    // src/utils/roomEntrances.ts), so weightMode/fixedWeight/isAccessible below are
    // inert placeholders, never actually read for routing purposes.
    id: 'room-entrance',
    name: 'Room Entrance',
    color: '#8B8B8B',
    dashPattern: [2, 3],
    weightMode: 'fixed',
    fixedWeight: 0,
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
// Multi-source: seeds every id in srcIds at distance 0 in one pass, rather than running
// a separate single-source search per candidate and comparing results — needed so
// routing to/from a multi-entrance room marker (dijkstraBetweenSets) finds the globally
// cheapest source→target pair in one O(n²) pass instead of O(sources × n²).
function runDijkstra(
  nodes: Node[],
  adj: Map<string, { neighborId: string; weight: number }[]>,
  srcIds: string[],
  isTarget: (id: string) => boolean,
): string[] | null {
  const srcIdSet = new Set(srcIds);
  const dist = new Map<string, number>();
  const prev = new Map<string, string | null>();
  const unvisited = new Set<string>();

  for (const node of nodes) {
    dist.set(node.id, srcIdSet.has(node.id) ? 0 : Infinity);
    prev.set(node.id, null);
    unvisited.add(node.id);
  }

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
  return srcIdSet.has(path[0]) ? path : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Finds the cheapest path between any node in srcIds and any node in targetIds.
 * Used to route to/from a room whose selection resolves to multiple candidate nodes
 * (e.g. a room marker's entrances) without ever treating those candidates as free to
 * move between — every candidate path is still costed over the real graph edges. Also
 * the general-purpose entry point for plain single-room and category routing — callers
 * just pass a one-element srcIds/targetIds set.
 */
export function dijkstraBetweenSets(
  nodes: Node[],
  edges: Edge[],
  srcIds: string[],
  targetIds: Set<string>,
  excludedTypes: Set<string>,
): string[] | null {
  if (srcIds.length === 0 || targetIds.size === 0) return null;
  const adj = buildAdjacency(nodes, edges, excludedTypes);
  return runDijkstra(nodes, adj, srcIds, (id) => targetIds.has(id));
}
