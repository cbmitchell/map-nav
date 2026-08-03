import type { Node } from '../types/graph';

export function getDistinctCategories(nodes: Node[], opts: { roomsOnly?: boolean } = {}): string[] {
  const source = opts.roomsOnly ? nodes.filter((n) => n.isRoom) : nodes;
  return [...new Set(source.map((n) => n.category).filter((c): c is string => !!c))].sort();
}
