import type { EdgeType, Node, Edge } from '../types/graph';

export const FIXED_WEIGHTS: Partial<Record<EdgeType, number>> = {
  stairs: 150,
  elevator: 300,
  bridge: 100,
};

export function dijkstra(
  nodes: Node[],
  edges: Edge[],
  srcId: string,
  tgtId: string,
  excludedTypes: Set<EdgeType>,
): string[] | null {
  // Stub — implemented in Phase 4
  void nodes;
  void edges;
  void srcId;
  void tgtId;
  void excludedTypes;
  return null;
}
