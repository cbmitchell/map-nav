import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import clsx from 'clsx';
import type { Dispatch } from 'react';
import type { Building, Node } from '../../types/graph';
import type { EditorState } from '../../types/editor';
import type { Action } from '../../hooks/useGraphReducer';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { screenToCanvas } from '../../hooks/useZoomPan';
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer';
import { distanceToSegment, px2norm } from '../../utils/geometry';
import { computeEdgeWeight } from '../../utils/pathfinding';
import { euclideanWeight } from '../../utils/geometry';
import { useMobile } from '../../hooks/useMobile';
import popupStyles from './EditorCanvas.module.css';

// ---------------------------------------------------------------------------
// Inline popup types
// ---------------------------------------------------------------------------

interface LabelEditorState {
  nodeId: string;
  screenX: number;
  screenY: number;
  label: string;
  isRoom: boolean;
  isConnector: boolean;
  category: string;
}

interface EdgeEditorState {
  edgeId: string;
  screenX: number;
  screenY: number;
}

interface CalibratePopupState {
  a: { nx: number; ny: number };
  b: { nx: number; ny: number };
  distance: string;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EditorCanvasProps {
  building: Building;
  activeSectionId: string | null;
  editorState: EditorState;
  onEditorStateChange: (update: Partial<EditorState>) => void;
  dispatch: Dispatch<Action>;
  zoomPan: ZoomPanState;
  onWheel: (e: WheelEvent, rect: DOMRect) => void;
  onPan: (dx: number, dy: number) => void;
  onResize: (w: number, h: number) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EditorCanvas({
  building,
  activeSectionId,
  editorState,
  onEditorStateChange,
  dispatch,
  zoomPan,
  onWheel,
  onPan,
  onResize,
}: EditorCanvasProps) {
  const { isMobile, isTablet } = useMobile();
  const isSmall = isMobile || isTablet;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const contentHRef = useRef(0);
  const dragRef = useRef<{ nodeId: string } | null>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const pendingClickRef = useRef<{ startX: number; startY: number; panned: boolean } | null>(null);
  const touchRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const spaceRef = useRef(false);


  const [labelEditor, setLabelEditor] = useState<LabelEditorState | null>(null);
  const [edgeEditor, setEdgeEditor] = useState<EdgeEditorState | null>(null);
  const [calibratePopup, setCalibratePopup] = useState<CalibratePopupState | null>(null);

  const { redraw } = useCanvasRenderer(canvasRef, building, activeSectionId, editorState, zoomPan);

  // Stable refs for use inside event handlers
  const esRef = useRef(editorState);
  esRef.current = editorState;
  const buildingRef = useRef(building);
  buildingRef.current = building;
  const activeSectionIdRef = useRef(activeSectionId);
  activeSectionIdRef.current = activeSectionId;
  const zoomPanRef = useRef(zoomPan);
  zoomPanRef.current = zoomPan;

  // ---------------------------------------------------------------------------
  // Canvas sizing
  // ---------------------------------------------------------------------------

  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const w = container.clientWidth;
      const section = buildingRef.current.sections.find((s) => s.id === activeSectionIdRef.current);
      const imageAspectH = section?.imageW ? Math.round(w * section.imageH / section.imageW) : w;
      contentHRef.current = imageAspectH;
      // On mobile/tablet, expand the canvas to fill all available vertical space so zoomed
      // content is not clipped at the image's unzoomed aspect-ratio boundary.
      const h = isSmall
        ? Math.max(container.clientHeight, imageAspectH)
        : imageAspectH;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      onResize(w, h);
      redraw();
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeSectionId, building.sections, redraw, isSmall, onResize]);

  // Wheel zoom (non-passive so we can preventDefault)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handler = (e: WheelEvent) => {
      const rect = canvas.getBoundingClientRect();
      onWheel(e, rect);
    };
    canvas.addEventListener('wheel', handler, { passive: false });
    return () => canvas.removeEventListener('wheel', handler);
  }, [onWheel]);

  // Space key for pan mode
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !(e.target instanceof HTMLInputElement)) {
        // Always suppress Space default on non-input elements — prevents a focused
        // <select> from toggling open on repeated keydown events while panning
        e.preventDefault();
        if (!e.repeat) {
          spaceRef.current = true;
          if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
        }
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        spaceRef.current = false;
        panRef.current = null;
        updateCursor();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // Canvas cursor based on mode
  useEffect(() => {
    updateCursor();
  }, [editorState.mode]);

  function updateCursor() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (spaceRef.current) { canvas.style.cursor = panRef.current ? 'grabbing' : 'grab'; return; }
    const map: Record<string, string> = { select: 'default', node: 'crosshair', edge: 'cell', link: 'crosshair', calibrate: 'crosshair' };
    canvas.style.cursor = map[esRef.current.mode] ?? 'default';
  }

  // ---------------------------------------------------------------------------
  // Coordinate helpers
  // ---------------------------------------------------------------------------

  function getScreenCoords(e: React.MouseEvent): { x: number; y: number } {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function getContentCoords(e: React.MouseEvent): { x: number; y: number } {
    return screenToCanvas(
      e.clientX - canvasRef.current!.getBoundingClientRect().left,
      e.clientY - canvasRef.current!.getBoundingClientRect().top,
      zoomPanRef.current,
    );
  }

  // Convert a content-space point to screen-space for popup positioning
  function contentToScreen(cx: number, cy: number): { x: number; y: number } {
    const { scale, panX, panY } = zoomPanRef.current;
    return { x: cx * scale + panX, y: cy * scale + panY };
  }

  // Hit test a node using screen-space coords and a fixed screen-space radius,
  // matching the fixed visual size nodes are drawn at.
  const SCREEN_HIT_RADIUS = 12;
  function hitNodeScreen(screenX: number, screenY: number, node: Node): boolean {
    const canvas = canvasRef.current!;
    const { x, y } = contentToScreen(node.nx * canvas.width, node.ny * contentHRef.current);
    return Math.hypot(screenX - x, screenY - y) < SCREEN_HIT_RADIUS;
  }

  function getSectionNodes() {
    return buildingRef.current.nodes.filter((n) => n.sectionId === activeSectionIdRef.current);
  }

  function getSectionEdges(nodes: ReturnType<typeof getSectionNodes>) {
    const nodeIds = new Set(nodes.map((n) => n.id));
    return buildingRef.current.edges.filter(
      (e) => !e.crossSection && nodeIds.has(e.srcId) && nodeIds.has(e.tgtId),
    );
  }

  // ---------------------------------------------------------------------------
  // Mouse events
  // ---------------------------------------------------------------------------

  const handleMouseDown = (e: React.MouseEvent) => {
    const screen = getScreenCoords(e);

    // Middle mouse button — start pan
    if (e.button === 1) {
      e.preventDefault();
      panRef.current = { lastX: screen.x, lastY: screen.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;

    // Space held — start pan (overrides all interactions)
    if (spaceRef.current) {
      panRef.current = { lastX: screen.x, lastY: screen.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    const { x, y } = getContentCoords(e);
    const canvas = canvasRef.current!;
    const W = canvas.width;
    const H = contentHRef.current;
    const es = esRef.current;
    const sectionNodes = getSectionNodes();

    if (es.mode === 'select') {
      setLabelEditor(null);
      setEdgeEditor(null);

      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) {
          onEditorStateChange({ selectedNodeId: node.id, selectedEdgeId: null });
          dragRef.current = { nodeId: node.id };
          return;
        }
      }

      // No node hit — set up pending action: pan on drag, click-to-select/deselect on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    if (es.mode === 'node') {
      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) return;
      }
      if (!activeSectionIdRef.current) return;
      // Set up pending action: pan on drag, place/split on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    if (es.mode === 'edge') {
      const nodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) {
          if (!es.pendingEdgeSrcId) {
            onEditorStateChange({ pendingEdgeSrcId: node.id });
            return;
          }
          if (es.pendingEdgeSrcId === node.id) {
            onEditorStateChange({ pendingEdgeSrcId: null });
            return;
          }
          const srcNode = nodeIndex.get(es.pendingEdgeSrcId);
          if (!srcNode) return;
          const type = es.currentEdgeType;
          const typeDef = buildingRef.current.edgeTypes.find((t) => t.id === type);
          const activeSection = buildingRef.current.sections.find((s) => s.id === activeSectionIdRef.current);
          const imgW = activeSection?.imageW ?? W;
          const imgH = activeSection?.imageH ?? H;
          const sectionScale = activeSection?.scale ?? 1.0;
          const weight = typeDef ? computeEdgeWeight(typeDef, srcNode, node, imgW, imgH, sectionScale) : euclideanWeight(srcNode, node, imgW, imgH) * sectionScale;
          dispatch({
            type: 'ADD_EDGE',
            payload: { srcId: es.pendingEdgeSrcId, tgtId: node.id, type, weight, crossSection: false },
          });
          onEditorStateChange({ pendingEdgeSrcId: null });
          return;
        }
      }
      // No node hit — set up pending action: pan on drag, cancel pending edge on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    if (es.mode === 'link' && es.pendingLinkSrc) {
      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) {
          if (!node.isConnector) return; // only connector nodes can be cross-section targets
          const type = es.currentEdgeType;
          const typeDef = buildingRef.current.edgeTypes.find((t) => t.id === type);
          const weight = typeDef?.weightMode === 'fixed' ? typeDef.fixedWeight : 100;
          dispatch({
            type: 'ADD_EDGE',
            payload: {
              srcId: es.pendingLinkSrc.nodeId,
              tgtId: node.id,
              type,
              weight,
              crossSection: true,
            },
          });
          onEditorStateChange({ mode: 'select', pendingLinkSrc: null });
          return;
        }
      }
      // No node hit — set up pending action: pan on drag, cancel link on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    if (es.mode === 'calibrate' && !calibratePopup) {
      const norm = px2norm(x, y, W, H);
      const clampedNx = Math.max(0, Math.min(1, norm.x));
      const clampedNy = Math.max(0, Math.min(1, norm.y));
      if (!es.calibrateA) {
        onEditorStateChange({ calibrateA: { nx: clampedNx, ny: clampedNy } });
      } else {
        const b = { nx: clampedNx, ny: clampedNy };
        onEditorStateChange({ calibrateB: b, mousePos: null });
        setCalibratePopup({ a: es.calibrateA, b, distance: '' });
      }
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const screen = getScreenCoords(e);

    // Promote pending click to pan if mouse moved beyond threshold
    if (pendingClickRef.current && !pendingClickRef.current.panned) {
      const dx = screen.x - pendingClickRef.current.startX;
      const dy = screen.y - pendingClickRef.current.startY;
      if (Math.hypot(dx, dy) > 4) {
        pendingClickRef.current.panned = true;
        panRef.current = { lastX: screen.x, lastY: screen.y };
        if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      }
    }

    // Pan (middle button, space+drag, or default drag on empty space)
    if (panRef.current) {
      const dx = screen.x - panRef.current.lastX;
      const dy = screen.y - panRef.current.lastY;
      panRef.current = { lastX: screen.x, lastY: screen.y };
      onPan(dx, dy);
      return;
    }

    const { x, y } = screenToCanvas(screen.x, screen.y, zoomPanRef.current);
    const canvas = canvasRef.current!;
    const W = canvas.width;
    const H = contentHRef.current;
    const es = esRef.current;

    // Rubber-band preview: store mouse in content coords
    if (es.mode === 'edge' || (es.mode === 'calibrate' && es.calibrateA && !calibratePopup)) {
      onEditorStateChange({ mousePos: { x, y } });
    }

    // Drag node
    if (dragRef.current && es.mode === 'select') {
      const norm = px2norm(x, y, W, H);
      dispatch({
        type: 'UPDATE_NODE',
        payload: {
          id: dragRef.current.nodeId,
          nx: Math.max(0, Math.min(1, norm.x)),
          ny: Math.max(0, Math.min(1, norm.y)),
        },
        canvasW: W,
        canvasH: H,
      });
    }

  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (pendingClickRef.current) {
      if (!pendingClickRef.current.panned) {
        const es = esRef.current;
        const sx = pendingClickRef.current.startX;
        const sy = pendingClickRef.current.startY;

        if (es.mode === 'select') {
          const sectionNodes = getSectionNodes();
          const sectionEdges = getSectionEdges(sectionNodes);
          const nodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
          const canvas = canvasRef.current!;
          const W = canvas.width;
          const H = contentHRef.current;
          let edgeHit = false;
          for (const edge of sectionEdges) {
            const src = nodeIndex.get(edge.srcId)!;
            const tgt = nodeIndex.get(edge.tgtId)!;
            const { x: ex, y: ey } = contentToScreen(src.nx * W, src.ny * H);
            const { x: tx, y: ty } = contentToScreen(tgt.nx * W, tgt.ny * H);
            if (distanceToSegment(sx, sy, ex, ey, tx, ty) < 6) {
              onEditorStateChange({ selectedEdgeId: edge.id, selectedNodeId: null });
              setEdgeEditor({ edgeId: edge.id, screenX: (ex + tx) / 2, screenY: (ey + ty) / 2 });
              edgeHit = true;
              break;
            }
          }
          if (!edgeHit) {
            onEditorStateChange({ selectedNodeId: null, selectedEdgeId: null });
          }
        }

        if (es.mode === 'node' && activeSectionIdRef.current) {
          const canvas = canvasRef.current!;
          const W = canvas.width;
          const H = contentHRef.current;
          const { x, y } = screenToCanvas(sx, sy, zoomPanRef.current);
          const norm = px2norm(x, y, W, H);
          const clampedNorm = { x: Math.max(0, Math.min(1, norm.x)), y: Math.max(0, Math.min(1, norm.y)) };
          const sectionNodes = getSectionNodes();
          const sectionEdges = getSectionEdges(sectionNodes);
          const edgeNodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
          let split = false;
          for (const edge of sectionEdges) {
            const edgeSrc = edgeNodeIndex.get(edge.srcId)!;
            const edgeTgt = edgeNodeIndex.get(edge.tgtId)!;
            const { x: esx, y: esy } = contentToScreen(edgeSrc.nx * W, edgeSrc.ny * H);
            const { x: etx, y: ety } = contentToScreen(edgeTgt.nx * W, edgeTgt.ny * H);
            if (distanceToSegment(sx, sy, esx, esy, etx, ety) < 8) {
              dispatch({ type: 'SPLIT_EDGE', payload: { edgeId: edge.id, nx: clampedNorm.x, ny: clampedNorm.y }, canvasW: W, canvasH: H });
              split = true;
              break;
            }
          }
          if (!split) {
            dispatch({
              type: 'ADD_NODE',
              payload: { sectionId: activeSectionIdRef.current, nx: clampedNorm.x, ny: clampedNorm.y, label: '', isRoom: false, isConnector: false },
            });
          }
        }

        if (es.mode === 'edge' && es.pendingEdgeSrcId) {
          onEditorStateChange({ pendingEdgeSrcId: null });
        }

        if (es.mode === 'link' && es.pendingLinkSrc) {
          onEditorStateChange({ mode: 'select', pendingLinkSrc: null });
        }
      }
      pendingClickRef.current = null;
      panRef.current = null;
      updateCursor();
    } else if (e.button === 1 || panRef.current) {
      panRef.current = null;
      updateCursor();
    }
    dragRef.current = null;
  };

  const handleDblClick = (e: React.MouseEvent) => {
    if (esRef.current.mode !== 'select') return;
    const screen = getScreenCoords(e);
    const sectionNodes = getSectionNodes();
    for (const node of sectionNodes) {
      if (hitNodeScreen(screen.x, screen.y, node)) {
        setEdgeEditor(null);
        const c = canvasRef.current!;
        const nodeScreen = contentToScreen(node.nx * c.width, node.ny * c.height);
        setLabelEditor({
          nodeId: node.id,
          screenX: nodeScreen.x,
          screenY: nodeScreen.y,
          label: node.label,
          isRoom: node.isRoom,
          isConnector: node.isConnector,
          category: node.category ?? '',
        });
        return;
      }
    }
  };

  const handleMouseLeave = () => {
    if (esRef.current.mode === 'edge' || esRef.current.mode === 'calibrate') {
      onEditorStateChange({ mousePos: null });
    }
    if (panRef.current && !spaceRef.current) {
      panRef.current = null;
      updateCursor();
    }
    pendingClickRef.current = null;
  };

  // ---------------------------------------------------------------------------
  // Touch events (reuse same hit-test and dispatch logic as mouse handlers)
  // ---------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = t.clientX - rect.left;
    const sy = t.clientY - rect.top;

    touchRef.current = { lastX: t.clientX, lastY: t.clientY };

    // Double-tap detection — fire label editor open if two taps within 300ms/20px
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.time < 300 && Math.hypot(sx - last.x, sy - last.y) < 20) {
      lastTapRef.current = null;
      if (esRef.current.mode === 'select') {
        const sectionNodes = getSectionNodes();
        for (const node of sectionNodes) {
          if (hitNodeScreen(sx, sy, node)) {
            setEdgeEditor(null);
            const c = canvasRef.current!;
            const nodeScreen = contentToScreen(node.nx * c.width, node.ny * c.height);
            setLabelEditor({
              nodeId: node.id,
              screenX: nodeScreen.x,
              screenY: nodeScreen.y,
              label: node.label,
              isRoom: node.isRoom,
              isConnector: node.isConnector,
              category: node.category ?? '',
            });
            return;
          }
        }
      }
      return;
    }
    lastTapRef.current = { time: now, x: sx, y: sy };

    // Synthesize a mouse-down equivalent using screen coords
    const { x, y } = screenToCanvas(sx, sy, zoomPanRef.current);
    const W = canvas.width;
    const H = contentHRef.current;
    const es = esRef.current;
    const sectionNodes = getSectionNodes();

    if (es.mode === 'select') {
      setLabelEditor(null);
      setEdgeEditor(null);
      for (const node of sectionNodes) {
        if (hitNodeScreen(sx, sy, node)) {
          onEditorStateChange({ selectedNodeId: node.id, selectedEdgeId: null });
          dragRef.current = { nodeId: node.id };
          return;
        }
      }
      const sectionEdges = getSectionEdges(sectionNodes);
      const nodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
      for (const edge of sectionEdges) {
        const src = nodeIndex.get(edge.srcId)!;
        const tgt = nodeIndex.get(edge.tgtId)!;
        const { x: ex, y: ey } = contentToScreen(src.nx * W, src.ny * H);
        const { x: tx, y: ty } = contentToScreen(tgt.nx * W, tgt.ny * H);
        if (distanceToSegment(sx, sy, ex, ey, tx, ty) < 6) {
          onEditorStateChange({ selectedEdgeId: edge.id, selectedNodeId: null });
          setEdgeEditor({ edgeId: edge.id, screenX: (ex + tx) / 2, screenY: (ey + ty) / 2 });
          return;
        }
      }
      onEditorStateChange({ selectedNodeId: null, selectedEdgeId: null });
    }

    if (es.mode === 'node') {
      for (const node of sectionNodes) {
        if (hitNodeScreen(sx, sy, node)) return;
      }
      if (!activeSectionIdRef.current) return;
      const norm = px2norm(x, y, W, H);
      const clamped = { x: Math.max(0, Math.min(1, norm.x)), y: Math.max(0, Math.min(1, norm.y)) };
      const sectionEdges = getSectionEdges(sectionNodes);
      const edgeNodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
      for (const edge of sectionEdges) {
        const edgeSrc = edgeNodeIndex.get(edge.srcId)!;
        const edgeTgt = edgeNodeIndex.get(edge.tgtId)!;
        const { x: ex, y: ey } = contentToScreen(edgeSrc.nx * W, edgeSrc.ny * H);
        const { x: tx, y: ty } = contentToScreen(edgeTgt.nx * W, edgeTgt.ny * H);
        if (distanceToSegment(sx, sy, ex, ey, tx, ty) < 8) {
          dispatch({ type: 'SPLIT_EDGE', payload: { edgeId: edge.id, nx: clamped.x, ny: clamped.y }, canvasW: W, canvasH: H });
          return;
        }
      }
      dispatch({
        type: 'ADD_NODE',
        payload: { sectionId: activeSectionIdRef.current, nx: clamped.x, ny: clamped.y, label: '', isRoom: false, isConnector: false },
      });
    }

    if (es.mode === 'edge') {
      const nodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
      for (const node of sectionNodes) {
        if (hitNodeScreen(sx, sy, node)) {
          if (!es.pendingEdgeSrcId) { onEditorStateChange({ pendingEdgeSrcId: node.id }); return; }
          if (es.pendingEdgeSrcId === node.id) { onEditorStateChange({ pendingEdgeSrcId: null }); return; }
          const srcNode = nodeIndex.get(es.pendingEdgeSrcId);
          if (!srcNode) return;
          const type = es.currentEdgeType;
          const typeDef = buildingRef.current.edgeTypes.find((t) => t.id === type);
          const activeSection = buildingRef.current.sections.find((s) => s.id === activeSectionIdRef.current);
          const imgW = activeSection?.imageW ?? W;
          const imgH = activeSection?.imageH ?? H;
          const sectionScale = activeSection?.scale ?? 1.0;
          const weight = typeDef ? computeEdgeWeight(typeDef, srcNode, node, imgW, imgH, sectionScale) : euclideanWeight(srcNode, node, imgW, imgH) * sectionScale;
          dispatch({ type: 'ADD_EDGE', payload: { srcId: es.pendingEdgeSrcId, tgtId: node.id, type, weight, crossSection: false } });
          onEditorStateChange({ pendingEdgeSrcId: null });
          return;
        }
      }
      if (es.pendingEdgeSrcId) onEditorStateChange({ pendingEdgeSrcId: null });
    }

    if (es.mode === 'link' && es.pendingLinkSrc) {
      for (const node of sectionNodes) {
        if (hitNodeScreen(sx, sy, node)) {
          if (!node.isConnector) return;
          const type = es.currentEdgeType;
          const typeDef = buildingRef.current.edgeTypes.find((t) => t.id === type);
          const weight = typeDef?.weightMode === 'fixed' ? typeDef.fixedWeight : 100;
          dispatch({ type: 'ADD_EDGE', payload: { srcId: es.pendingLinkSrc.nodeId, tgtId: node.id, type, weight, crossSection: true } });
          onEditorStateChange({ mode: 'select', pendingLinkSrc: null });
          return;
        }
      }
      onEditorStateChange({ mode: 'select', pendingLinkSrc: null });
    }

    if (es.mode === 'calibrate' && !calibratePopup) {
      const norm = px2norm(x, y, W, H);
      const clampedNx = Math.max(0, Math.min(1, norm.x));
      const clampedNy = Math.max(0, Math.min(1, norm.y));
      if (!es.calibrateA) {
        onEditorStateChange({ calibrateA: { nx: clampedNx, ny: clampedNy } });
      } else {
        const b = { nx: clampedNx, ny: clampedNy };
        onEditorStateChange({ calibrateB: b, mousePos: null });
        setCalibratePopup({ a: es.calibrateA, b, distance: '' });
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length !== 1 || !touchRef.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.lastX;
    const dy = t.clientY - touchRef.current.lastY;
    touchRef.current = { lastX: t.clientX, lastY: t.clientY };

    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = t.clientX - rect.left;
    const sy = t.clientY - rect.top;
    const { x, y } = screenToCanvas(sx, sy, zoomPanRef.current);
    const W = canvas.width;
    const H = contentHRef.current;
    const es = esRef.current;

    if (es.mode === 'edge' || (es.mode === 'calibrate' && es.calibrateA && !calibratePopup)) {
      onEditorStateChange({ mousePos: { x, y } });
    }

    if (dragRef.current && es.mode === 'select') {
      const norm = px2norm(x, y, W, H);
      dispatch({
        type: 'UPDATE_NODE',
        payload: { id: dragRef.current.nodeId, nx: Math.max(0, Math.min(1, norm.x)), ny: Math.max(0, Math.min(1, norm.y)) },
        canvasW: W,
        canvasH: H,
      });
      return;
    }

    onPan(dx, dy);
  };

  const handleTouchEnd = () => {
    touchRef.current = null;
    dragRef.current = null;
    if (esRef.current.mode === 'edge' || esRef.current.mode === 'calibrate') {
      onEditorStateChange({ mousePos: null });
    }
  };

  // ---------------------------------------------------------------------------
  // Label editor
  // ---------------------------------------------------------------------------

  const submitLabelEditor = () => {
    if (!labelEditor) return;
    dispatch({
      type: 'UPDATE_NODE',
      payload: {
        id: labelEditor.nodeId,
        label: labelEditor.label,
        isRoom: labelEditor.isRoom,
        isConnector: labelEditor.isConnector,
        category: labelEditor.isRoom && labelEditor.category.trim() ? labelEditor.category.trim() : undefined,
      },
    });
    setLabelEditor(null);
  };

  // ---------------------------------------------------------------------------
  // Calibration
  // ---------------------------------------------------------------------------

  const submitCalibration = () => {
    if (!calibratePopup || !activeSectionId) return;
    const dist = parseFloat(calibratePopup.distance);
    if (!isFinite(dist) || dist <= 0) return;
    const section = building.sections.find((s) => s.id === activeSectionId);
    if (!section) return;
    const pixelDist = Math.hypot(
      (calibratePopup.b.nx - calibratePopup.a.nx) * section.imageW,
      (calibratePopup.b.ny - calibratePopup.a.ny) * section.imageH,
    );
    if (pixelDist === 0) return;
    dispatch({ type: 'CALIBRATE_SECTION', payload: { sectionId: activeSectionId, scale: dist / pixelDist } });
    onEditorStateChange({ calibrateA: null, calibrateB: null, mode: 'select' });
    setCalibratePopup(null);
  };

  const cancelCalibration = () => {
    onEditorStateChange({ calibrateA: null, calibrateB: null });
    setCalibratePopup(null);
  };

  // ---------------------------------------------------------------------------
  // Edge editor
  // ---------------------------------------------------------------------------

  const handleEdgeTypeChange = (typeId: string) => {
    if (!edgeEditor) return;
    dispatch({ type: 'UPDATE_EDGE', payload: { id: edgeEditor.edgeId, type: typeId } });
    setEdgeEditor(null);
    onEditorStateChange({ selectedEdgeId: null });
  };

  const handleDeleteEdge = () => {
    if (!edgeEditor) return;
    dispatch({ type: 'DELETE_EDGE', payload: { id: edgeEditor.edgeId } });
    setEdgeEditor(null);
    onEditorStateChange({ selectedEdgeId: null });
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const section = building.sections.find((s) => s.id === activeSectionId);
  const hasImage = !!section?.imageData;
  const canvasW = canvasRef.current?.width ?? 400;

  const closePopups = () => { setLabelEditor(null); setEdgeEditor(null); setCalibratePopup(null); onEditorStateChange({ calibrateA: null, calibrateB: null }); };

  return (
    <div ref={containerRef} className={popupStyles.container} onMouseLeave={handleMouseLeave}>
      {!hasImage && (
        <div className={popupStyles.placeholder}>
          <span>Upload a map image to begin</span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDblClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Label editor popup / bottom sheet */}
      {labelEditor && (
        <>
          {isSmall && <div className={popupStyles.sheetBackdrop} onClick={closePopups} />}
          <div
            className={isSmall ? popupStyles.bottomSheet : popupStyles.popup}
            style={isSmall ? undefined : {
              left: Math.min(labelEditor.screenX + 12, canvasW - 220),
              top: labelEditor.screenY + 16,
            }}
          >
            {isSmall && <div className={popupStyles.dragHandle} />}
            <div className={popupStyles.popupRow}>
              <label className={popupStyles.popupLabel}>Label</label>
              <input
                className={clsx(popupStyles.popupInput, isSmall && popupStyles.popupInputSheet)}
                autoFocus
                value={labelEditor.label}
                onChange={(ev) => setLabelEditor({ ...labelEditor, label: ev.target.value })}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') submitLabelEditor();
                  if (ev.key === 'Escape') setLabelEditor(null);
                }}
              />
            </div>
            <div className={popupStyles.popupRow}>
              <label className={popupStyles.checkLabel}>
                <input
                  type="checkbox"
                  checked={labelEditor.isRoom}
                  onChange={(ev) => setLabelEditor({ ...labelEditor, isRoom: ev.target.checked })}
                />
                <span>Is room</span>
              </label>
            </div>
            {labelEditor.isRoom && (
              <div className={popupStyles.popupRow}>
                <label className={popupStyles.popupLabel}>Category</label>
                <input
                  className={clsx(popupStyles.popupInput, isSmall && popupStyles.popupInputSheet)}
                  placeholder="e.g. bathroom"
                  value={labelEditor.category}
                  onChange={(ev) => setLabelEditor({ ...labelEditor, category: ev.target.value })}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') submitLabelEditor();
                    if (ev.key === 'Escape') setLabelEditor(null);
                  }}
                />
              </div>
            )}
            <div className={popupStyles.popupRow}>
              <label className={popupStyles.checkLabel}>
                <input
                  type="checkbox"
                  checked={labelEditor.isConnector}
                  onChange={(ev) => setLabelEditor({ ...labelEditor, isConnector: ev.target.checked })}
                />
                <span>Is connector</span>
              </label>
            </div>
            <div className={popupStyles.popupActions}>
              <button className={popupStyles.popupBtn} onClick={() => setLabelEditor(null)}>Cancel</button>
              <button className={clsx(popupStyles.popupBtn, popupStyles.popupBtnPrimary)} onClick={submitLabelEditor}>
                Save
              </button>
            </div>
          </div>
        </>
      )}

      {/* Edge editor popup / bottom sheet */}
      {edgeEditor && (
        <>
          {isSmall && <div className={popupStyles.sheetBackdrop} onClick={closePopups} />}
          <div
            className={isSmall ? popupStyles.bottomSheet : popupStyles.popup}
            style={isSmall ? undefined : {
              left: Math.min(edgeEditor.screenX + 8, canvasW - 200),
              top: edgeEditor.screenY + 8,
            }}
          >
            {isSmall && <div className={popupStyles.dragHandle} />}
            <div className={popupStyles.edgeTypeBtnRow}>
              {building.edgeTypes.map((typeDef) => {
                const currentEdge = building.edges.find((e) => e.id === edgeEditor.edgeId);
                const isActive = currentEdge?.type === typeDef.id;
                return (
                  <button
                    key={typeDef.id}
                    className={popupStyles.edgeTypeBtn}
                    style={{
                      borderColor: typeDef.color,
                      color: isActive ? '#fff' : typeDef.color,
                      background: isActive ? typeDef.color : 'transparent',
                    }}
                    onClick={() => handleEdgeTypeChange(typeDef.id)}
                  >
                    {typeDef.name}
                  </button>
                );
              })}
            </div>
            <div className={popupStyles.popupActions}>
              <button className={clsx(popupStyles.popupBtn, popupStyles.popupBtnDanger)} onClick={handleDeleteEdge}>
                Delete Edge
              </button>
            </div>
          </div>
        </>
      )}

      {/* Calibration popup / bottom sheet */}
      {calibratePopup && (
        <>
          {isSmall && <div className={popupStyles.sheetBackdrop} onClick={closePopups} />}
          <div
            className={isSmall ? popupStyles.bottomSheet : popupStyles.popup}
            style={isSmall ? undefined : { left: Math.min(canvasW / 2 - 100, canvasW - 220), top: 60 }}
          >
            {isSmall && <div className={popupStyles.dragHandle} />}
            <div className={popupStyles.popupRow}>
              <label className={popupStyles.popupLabel}>Distance between points</label>
              <input
                className={clsx(popupStyles.popupInput, isSmall && popupStyles.popupInputSheet)}
                type="number"
                min="0"
                step="any"
                placeholder="e.g. 10"
                autoFocus
                value={calibratePopup.distance}
                onChange={(ev) => setCalibratePopup({ ...calibratePopup, distance: ev.target.value })}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter') submitCalibration();
                  if (ev.key === 'Escape') cancelCalibration();
                }}
              />
            </div>
            <div className={popupStyles.popupActions}>
              <button className={popupStyles.popupBtn} onClick={cancelCalibration}>Cancel</button>
              <button
                className={clsx(popupStyles.popupBtn, popupStyles.popupBtnPrimary)}
                onClick={submitCalibration}
                disabled={!calibratePopup.distance || parseFloat(calibratePopup.distance) <= 0}
              >
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
