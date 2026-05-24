import type { Node } from '../types/graph';

const HIT_RADIUS = 12;

export function norm2px(
  nx: number,
  ny: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  return { x: nx * canvasW, y: ny * canvasH };
}

export function px2norm(
  px: number,
  py: number,
  canvasW: number,
  canvasH: number,
): { x: number; y: number } {
  return { x: px / canvasW, y: py / canvasH };
}

export function euclideanWeight(
  a: Node,
  b: Node,
  canvasW: number,
  canvasH: number,
): number {
  const ax = a.nx * canvasW;
  const ay = a.ny * canvasH;
  const bx = b.nx * canvasW;
  const by = b.ny * canvasH;
  return Math.hypot(bx - ax, by - ay);
}

export function hitTestNode(
  mouseX: number,
  mouseY: number,
  node: Node,
  canvasW: number,
  canvasH: number,
): boolean {
  const { x, y } = norm2px(node.nx, node.ny, canvasW, canvasH);
  return Math.hypot(mouseX - x, mouseY - y) < HIT_RADIUS;
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}
