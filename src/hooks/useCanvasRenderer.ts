import { useCallback, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import type { Building, EdgeType } from '../types/graph';
import type { EditorState } from '../types/editor';
import { DEFAULT_EDITOR_STATE } from '../types/editor';
import type { ZoomPanState } from './useZoomPan';
import { DEFAULT_ZOOM_PAN } from './useZoomPan';

// ---------------------------------------------------------------------------
// Edge display constants
// ---------------------------------------------------------------------------

export const EDGE_COLORS: Record<EdgeType, string> = {
  walkway: '#378ADD',
  stairs: '#D85A30',
  elevator: '#534AB7',
  ramp: '#1D9E75',
  bridge: '#EF9F27',
};

export const EDGE_DASHES: Record<EdgeType, number[]> = {
  walkway: [],
  stairs: [12, 6],
  elevator: [4, 4],
  ramp: [12, 6],
  bridge: [8, 4, 2, 4],
};

export const EDGE_LABELS: Record<EdgeType, string> = {
  walkway: 'Walkway',
  stairs: 'Stairs',
  elevator: 'Elevator',
  ramp: 'Ramp',
  bridge: 'Bridge',
};

const PATH_COLOR = '#EF9F27';
const DIM_ALPHA = 0.15;

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useCanvasRenderer(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  building: Building,
  activeSectionId: string | null,
  editorState: EditorState = DEFAULT_EDITOR_STATE,
  zoomPan: ZoomPanState = DEFAULT_ZOOM_PAN,
  highlightPath: string[] | null = null,
) {
  const buildingRef = useRef(building);
  const activeSectionIdRef = useRef(activeSectionId);
  const editorStateRef = useRef(editorState);
  const zoomPanRef = useRef(zoomPan);
  const highlightPathRef = useRef(highlightPath);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());

  buildingRef.current = building;
  activeSectionIdRef.current = activeSectionId;
  editorStateRef.current = editorState;
  zoomPanRef.current = zoomPan;
  highlightPathRef.current = highlightPath;

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    const building = buildingRef.current;
    const activeSectionId = activeSectionIdRef.current;
    const es = editorStateRef.current;
    const { scale, panX, panY } = zoomPanRef.current;
    const path = highlightPathRef.current;

    // Build path lookup structures when a highlight path is provided
    const pathNodeSet = path ? new Set(path) : null;
    const pathEdgePairs = new Set<string>();
    if (path) {
      for (let i = 0; i < path.length - 1; i++) {
        pathEdgePairs.add(`${path[i]}|${path[i + 1]}`);
        pathEdgePairs.add(`${path[i + 1]}|${path[i]}`);
      }
    }

    const isPathMode = pathNodeSet !== null;

    // Fill the full canvas with a dark background (screen space, no transform)
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, W, H);

    // Apply zoom/pan transform — all content draws below use content coords
    ctx.setTransform(scale, 0, 0, scale, panX, panY);

    const section = building.sections.find((s) => s.id === activeSectionId);

    // 1. Map image
    if (section?.imageData) {
      const cacheKey = section.id;
      let img = imageCache.current.get(cacheKey);
      if (!img || (img as HTMLImageElement & { _src?: string })._src !== section.imageData) {
        img = new Image();
        (img as HTMLImageElement & { _src?: string })._src = section.imageData;
        img.onload = () => redraw();
        img.src = section.imageData;
        imageCache.current.set(cacheKey, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, W, H);
      }
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, W, H);
    }

    // 2. Semi-transparent overlay
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, H);

    // Switch to screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const sectionNodes = building.nodes.filter((n) => n.sectionId === activeSectionId);
    const nodeIndex = new Map(building.nodes.map((n) => [n.id, n]));

    const sectionEdges = building.edges.filter((e) => {
      if (e.crossSection) return false;
      return (
        nodeIndex.has(e.srcId) &&
        nodeIndex.has(e.tgtId) &&
        nodeIndex.get(e.srcId)!.sectionId === activeSectionId &&
        nodeIndex.get(e.tgtId)!.sectionId === activeSectionId
      );
    });

    // Helper: content coords → screen coords
    const toScreen = (cx: number, cy: number) => ({
      x: cx * scale + panX,
      y: cy * scale + panY,
    });

    // 3. Edges
    // When in path mode: draw non-path edges first (dimmed), then path edges on top
    const drawEdge = (edge: typeof sectionEdges[number], isPath: boolean) => {
      const src = nodeIndex.get(edge.srcId)!;
      const tgt = nodeIndex.get(edge.tgtId)!;
      const { x: sx, y: sy } = toScreen(src.nx * W, src.ny * H);
      const { x: tx, y: ty } = toScreen(tgt.nx * W, tgt.ny * H);
      const isSelected = edge.id === es.selectedEdgeId;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);

      if (isPath) {
        ctx.strokeStyle = PATH_COLOR;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = isSelected ? '#ffffff' : EDGE_COLORS[edge.type];
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash(EDGE_DASHES[edge.type]);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      // Edge weight label (editor only)
      if (!isPathMode) {
        const mx = (sx + tx) / 2;
        const my = (sy + ty) / 2;
        const weightLabel = Math.round(edge.weight).toString();
        ctx.font = '11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const tw = ctx.measureText(weightLabel).width;
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(mx - tw / 2 - 2, my - 9 - 7, tw + 4, 14);
        ctx.fillStyle = '#ccc';
        ctx.fillText(weightLabel, mx, my - 9);
      }
    };

    if (isPathMode) {
      ctx.globalAlpha = DIM_ALPHA;
      for (const edge of sectionEdges) {
        const onPath = pathEdgePairs.has(`${edge.srcId}|${edge.tgtId}`);
        if (!onPath) drawEdge(edge, false);
      }
      ctx.globalAlpha = 1;
      for (const edge of sectionEdges) {
        const onPath = pathEdgePairs.has(`${edge.srcId}|${edge.tgtId}`);
        if (onPath) drawEdge(edge, true);
      }
    } else {
      for (const edge of sectionEdges) drawEdge(edge, false);
    }

    // 4. Rubber-band preview (editor only)
    if (es.mode === 'edge' && es.pendingEdgeSrcId && es.mousePos) {
      const srcNode = nodeIndex.get(es.pendingEdgeSrcId);
      if (srcNode) {
        const src = toScreen(srcNode.nx * W, srcNode.ny * H);
        const mouse = toScreen(es.mousePos.x, es.mousePos.y);
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = EDGE_COLORS[es.currentEdgeType];
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // 5. Nodes
    const drawNode = (node: typeof sectionNodes[number], isPath: boolean) => {
      const { x, y } = toScreen(node.nx * W, node.ny * H);

      const hasCrossSection = building.edges.some(
        (e) => e.crossSection && (e.srcId === node.id || e.tgtId === node.id),
      );
      if (hasCrossSection && !isPathMode) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Path highlight ring
      if (isPath) {
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.strokeStyle = PATH_COLOR;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      let fillColor: string;
      if (node.id === es.selectedNodeId) fillColor = '#7C3AED';
      else if (node.id === es.pendingEdgeSrcId) fillColor = '#F97316';
      else if (node.isConnector) fillColor = '#EF9F27';
      else if (node.isRoom) fillColor = '#1D9E75';
      else fillColor = '#378ADD';

      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Node label
      if (node.label && (!isPathMode || isPath)) {
        ctx.font = '12px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labelW = ctx.measureText(node.label).width;
        const pad = 3;
        const labelX = x - labelW / 2 - pad;
        const labelY = y + 12;
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fillRect(labelX, labelY, labelW + pad * 2, 16);
        ctx.fillStyle = isPath ? PATH_COLOR : '#fff';
        ctx.fillText(node.label, x, labelY + 2);
      }
    };

    if (isPathMode) {
      ctx.globalAlpha = DIM_ALPHA;
      for (const node of sectionNodes) {
        if (!pathNodeSet!.has(node.id)) drawNode(node, false);
      }
      ctx.globalAlpha = 1;
      for (const node of sectionNodes) {
        if (pathNodeSet!.has(node.id)) drawNode(node, true);
      }
    } else {
      for (const node of sectionNodes) drawNode(node, false);
    }

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [canvasRef]);

  useEffect(() => {
    redraw();
  }, [redraw, building, activeSectionId, editorState, zoomPan, highlightPath]);

  return { redraw };
}
