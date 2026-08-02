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

export function closestPointOnSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): { x: number; y: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return { x: x1, y: y1 };
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const pt = closestPointOnSegment(px, py, x1, y1, x2, y2);
  return Math.hypot(px - pt.x, py - pt.y);
}
