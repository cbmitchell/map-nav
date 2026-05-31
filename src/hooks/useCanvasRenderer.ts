import { useCallback, useLayoutEffect, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import type { Building, EdgeTypeDef } from '../types/graph';
import type { EditorState } from '../types/editor';
import { DEFAULT_EDITOR_STATE } from '../types/editor';
import type { ZoomPanState } from './useZoomPan';
import { DEFAULT_ZOOM_PAN } from './useZoomPan';

// ---------------------------------------------------------------------------
// Edge display helpers (derived from building.edgeTypes at render time)
// ---------------------------------------------------------------------------

export function buildEdgeLookups(edgeTypes: EdgeTypeDef[]) {
  return {
    colors: Object.fromEntries(edgeTypes.map((t) => [t.id, t.color])) as Record<string, string>,
    dashes: Object.fromEntries(edgeTypes.map((t) => [t.id, t.dashPattern])) as Record<string, number[]>,
    labels: Object.fromEntries(edgeTypes.map((t) => [t.id, t.name])) as Record<string, string>,
  };
}

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
  roomsOnly = false,
) {
  const buildingRef = useRef(building);
  const activeSectionIdRef = useRef(activeSectionId);
  const editorStateRef = useRef(editorState);
  const zoomPanRef = useRef(zoomPan);
  const highlightPathRef = useRef(highlightPath);
  const roomsOnlyRef = useRef(roomsOnly);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const redrawRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    buildingRef.current = building;
    activeSectionIdRef.current = activeSectionId;
    editorStateRef.current = editorState;
    zoomPanRef.current = zoomPan;
    highlightPathRef.current = highlightPath;
    roomsOnlyRef.current = roomsOnly;
  });

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
    const roomsOnly = roomsOnlyRef.current;

    // On mobile the canvas may be taller than the image aspect ratio (fills the screen).
    // Content coordinates are always bounded by the image's natural aspect ratio.
    const activeSection = building.sections.find((s) => s.id === activeSectionId);
    const contentH = activeSection?.imageW && W > 0
      ? Math.round(W * activeSection.imageH / activeSection.imageW)
      : H;

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
        img.onload = () => redrawRef.current();
        img.onerror = () => { imageCache.current.delete(cacheKey); };
        img.src = section.imageData;
        imageCache.current.set(cacheKey, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, 0, 0, W, contentH);
      }
    } else {
      ctx.fillStyle = '#222';
      ctx.fillRect(0, 0, W, contentH);
    }

    // 2. Semi-transparent overlay (only over the image area)
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, contentH);

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

    // Build cross-section lookup once to avoid O(nodes × edges) per frame
    const crossSectionNodeIds = new Set<string>();
    for (const e of building.edges) {
      if (e.crossSection) {
        crossSectionNodeIds.add(e.srcId);
        crossSectionNodeIds.add(e.tgtId);
      }
    }

    const edgeLookups = buildEdgeLookups(building.edgeTypes);

    // 3. Edges
    const drawEdge = (edge: typeof sectionEdges[number], isPath: boolean) => {
      const src = nodeIndex.get(edge.srcId);
      const tgt = nodeIndex.get(edge.tgtId);
      if (!src || !tgt) return; // skip orphaned edges (corrupted data guard)
      const { x: sx, y: sy } = toScreen(src.nx * W, src.ny * contentH);
      const { x: tx, y: ty } = toScreen(tgt.nx * W, tgt.ny * contentH);
      const isSelected = edge.id === es.selectedEdgeId;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);

      if (isPath) {
        ctx.strokeStyle = PATH_COLOR;
        ctx.lineWidth = 3;
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = isSelected ? '#ffffff' : (edgeLookups.colors[edge.type] ?? '#888');
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.setLineDash(edgeLookups.dashes[edge.type] ?? []);
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
    } else if (!roomsOnly) {
      for (const edge of sectionEdges) drawEdge(edge, false);
    }

    // 4. Rubber-band preview (editor only)
    if (es.mode === 'edge' && es.pendingEdgeSrcId && es.mousePos) {
      const srcNode = nodeIndex.get(es.pendingEdgeSrcId);
      if (srcNode) {
        const src = toScreen(srcNode.nx * W, srcNode.ny * contentH);
        const mouse = toScreen(es.mousePos.x, es.mousePos.y);
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.strokeStyle = edgeLookups.colors[es.currentEdgeType] ?? '#888';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.7;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
    }

    // 4b. Calibration overlay (calibrate mode)
    if (es.mode === 'calibrate' && es.calibrateA) {
      const aScreen = toScreen(es.calibrateA.nx * W, es.calibrateA.ny * contentH);

      if (es.calibrateB) {
        // Both points set — draw solid line between them
        const bScreen = toScreen(es.calibrateB.nx * W, es.calibrateB.ny * contentH);
        ctx.beginPath();
        ctx.moveTo(aScreen.x, aScreen.y);
        ctx.lineTo(bScreen.x, bScreen.y);
        ctx.strokeStyle = '#F97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.globalAlpha = 1;
        // Draw point B
        ctx.beginPath();
        ctx.arc(bScreen.x, bScreen.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#F97316';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      } else if (es.mousePos) {
        // Rubber-band line to cursor
        const mScreen = toScreen(es.mousePos.x, es.mousePos.y);
        ctx.beginPath();
        ctx.moveTo(aScreen.x, aScreen.y);
        ctx.lineTo(mScreen.x, mScreen.y);
        ctx.strokeStyle = '#F97316';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.globalAlpha = 0.75;
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }

      // Draw point A
      ctx.beginPath();
      ctx.arc(aScreen.x, aScreen.y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#F97316';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // 5. Nodes
    const drawNode = (node: typeof sectionNodes[number], isPath: boolean) => {
      const { x, y } = toScreen(node.nx * W, node.ny * contentH);

      const hasCrossSection = crossSectionNodeIds.has(node.id);
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
      const isSignificantNode = (n: typeof sectionNodes[number]) =>
        n.isRoom || n.isConnector || n.label !== '';
      ctx.globalAlpha = 1;
      for (const node of sectionNodes) {
        if (pathNodeSet!.has(node.id) && isSignificantNode(node)) drawNode(node, true);
      }
    } else {
      for (const node of sectionNodes) {
        if (!roomsOnly || node.isRoom) drawNode(node, false);
      }
    }

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [canvasRef]);

  useLayoutEffect(() => { redrawRef.current = redraw; }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw, building, activeSectionId, editorState, zoomPan, highlightPath, roomsOnly]);

  return { redraw };
}
