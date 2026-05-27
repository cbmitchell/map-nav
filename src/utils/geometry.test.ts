import { describe, it, expect } from 'vitest';
import { norm2px, px2norm, euclideanWeight, hitTestNode, distanceToSegment } from './geometry';
import type { Node } from '../types/graph';

function node(nx: number, ny: number): Node {
  return { id: 'n', sectionId: 's', nx, ny, label: '', isRoom: false, isConnector: false };
}

describe('norm2px', () => {
  it('converts normalized coords to pixel coords', () => {
    expect(norm2px(0.5, 0.25, 800, 600)).toEqual({ x: 400, y: 150 });
  });

  it('returns origin at (0, 0) for normalized (0, 0)', () => {
    expect(norm2px(0, 0, 800, 600)).toEqual({ x: 0, y: 0 });
  });

  it('returns full dimensions at normalized (1, 1)', () => {
    expect(norm2px(1, 1, 800, 600)).toEqual({ x: 800, y: 600 });
  });
});

describe('px2norm', () => {
  it('is the inverse of norm2px', () => {
    const { x, y } = norm2px(0.3, 0.7, 1000, 500);
    expect(px2norm(x, y, 1000, 500)).toEqual({ x: 0.3, y: 0.7 });
  });
});

describe('euclideanWeight', () => {
  it('computes distance between two nodes in pixel space', () => {
    const a = node(0, 0);
    const b = node(1, 0);
    expect(euclideanWeight(a, b, 100, 100)).toBe(100);
  });

  it('returns 0 for coincident nodes', () => {
    const a = node(0.5, 0.5);
    expect(euclideanWeight(a, a, 800, 600)).toBe(0);
  });

  it('computes diagonal distance correctly', () => {
    const a = node(0, 0);
    const b = node(0.3, 0.4); // 3-4-5 triangle at scale 100
    expect(euclideanWeight(a, b, 100, 100)).toBeCloseTo(50);
  });
});

describe('hitTestNode', () => {
  it('returns true when mouse is inside the hit radius', () => {
    const n = node(0.5, 0.5);
    // node pixel position: (400, 300); mouse at (408, 308) → distance ~11.3 < 12
    expect(hitTestNode(408, 308, n, 800, 600)).toBe(true);
  });

  it('returns false when mouse is outside the hit radius', () => {
    const n = node(0.5, 0.5);
    // node pixel position: (400, 300); mouse at (415, 315) → distance ~21 > 12
    expect(hitTestNode(415, 315, n, 800, 600)).toBe(false);
  });

  it('returns true when mouse is exactly on the node', () => {
    const n = node(0.25, 0.75);
    expect(hitTestNode(200, 450, n, 800, 600)).toBe(true);
  });
});

describe('distanceToSegment', () => {
  it('returns distance from point to nearest point on segment', () => {
    // Segment from (0,0) to (10,0), point at (5,3) → distance = 3
    expect(distanceToSegment(5, 3, 0, 0, 10, 0)).toBeCloseTo(3);
  });

  it('clamps to segment endpoint when perpendicular falls outside', () => {
    // Segment from (0,0) to (10,0), point at (15,0) → clamped to (10,0), distance = 5
    expect(distanceToSegment(15, 0, 0, 0, 10, 0)).toBeCloseTo(5);
  });

  it('handles zero-length segment (returns distance to the point)', () => {
    expect(distanceToSegment(3, 4, 0, 0, 0, 0)).toBeCloseTo(5);
  });
});
