import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import clsx from 'clsx';
import type { Dispatch } from 'react';
import type { Building, Node, EdgeType } from '../../types/graph';
import type { EditorState } from '../../types/editor';
import type { Action } from '../../hooks/useGraphReducer';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { screenToCanvas, fitZoomPan, DEFAULT_ZOOM_PAN } from '../../hooks/useZoomPan';
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer';
import { distanceToSegment, px2norm, closestPointOnSegment } from '../../utils/geometry';
import { computeEdgeWeight } from '../../utils/pathfinding';
import { euclideanWeight } from '../../utils/geometry';
import { ROOM_ENTRANCE_EDGE_TYPE, getRoomEntranceIds } from '../../utils/roomEntrances';
import { useMobile } from '../../hooks/useMobile';
import { generateId } from '../../utils/id';
import { getDistinctCategories } from '../../utils/categories';
import { parseAliases } from '../../utils/aliases';
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
  isRoomMarker: boolean;
  aliases: string;
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
  onZoomAt: (screenX: number, screenY: number, newScale: number) => void;
  onResize: (w: number, h: number) => void;
  onAutoFit: (state: ZoomPanState) => void;
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
  onZoomAt,
  onResize,
  onAutoFit,
}: EditorCanvasProps) {
  const { isMobile, isTablet } = useMobile();
  const isSmall = isMobile || isTablet;
  // Auto-connect/snap-to-axis are unavailable in mobile mode — gate on this everywhere
  // instead of the raw flag, so it stays inert even if state persists across a resize.
  const pathModeActive = editorState.autoConnectEnabled && !isSmall;

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const labelPopupRef = useRef<HTMLDivElement>(null);
  const edgePopupRef = useRef<HTMLDivElement>(null);
  const contentHRef = useRef(0);
  const dragRef = useRef<{ nodeId: string; moved: boolean } | null>(null);
  const imageDragRef = useRef<{ lastX: number; lastY: number; moved: boolean } | null>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const pendingClickRef = useRef<{ startX: number; startY: number; panned: boolean } | null>(null);
  const touchRef = useRef<{ lastX: number; lastY: number; lastDist: number } | null>(null);
  const lastTapRef = useRef<{ time: number; x: number; y: number } | null>(null);
  const spaceRef = useRef(false);
  const hoverNodeRef = useRef(false);


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
      // The canvas buffer is always just the visible viewport size — zoom/pan is
      // handled entirely by the transform in useCanvasRenderer, which can display any
      // window of content-space within a fixed-size buffer, so the buffer itself never
      // needs to grow to accommodate a tall image or a zoomed-in view.
      const h = container.clientHeight;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      onResize(w, h);

      // If the view hasn't been customized for this section (still at the untouched
      // default), fit the whole image into the visible area instead of leaving it at
      // 1:1 scale, which crops the bottom of any image taller than the viewport.
      const zp = zoomPanRef.current;
      if (zp.scale === DEFAULT_ZOOM_PAN.scale && zp.panX === DEFAULT_ZOOM_PAN.panX && zp.panY === DEFAULT_ZOOM_PAN.panY) {
        onAutoFit(fitZoomPan({ minX: 0, minY: 0, maxX: w, maxY: imageAspectH }, container.clientWidth, container.clientHeight, 0));
      }

      redraw();
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeSectionId, building.sections, redraw, isSmall, onResize, onAutoFit]);

  // Close the edge editor popup if its edge was deleted elsewhere (keyboard shortcut,
  // sidebar delete button) — not just via this popup's own Delete Edge button. Adjusting
  // state during render, rather than in an effect, is React's recommended pattern for
  // reacting to a prop/state change like this — see the other examples in Editor.tsx
  // and NavigatorCanvas.tsx: https://react.dev/learn/you-might-not-need-an-effect
  if (edgeEditor && !building.edges.some((e) => e.id === edgeEditor.edgeId)) {
    setEdgeEditor(null);
  }

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
    if (esRef.current.mode === 'adjust-image') { canvas.style.cursor = imageDragRef.current ? 'grabbing' : 'grab'; return; }
    if (esRef.current.mode === 'pan') { canvas.style.cursor = panRef.current ? 'grabbing' : 'grab'; return; }
    if (hoverNodeRef.current) { canvas.style.cursor = 'pointer'; return; }
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
  // Shared per-mode tap handlers
  //
  // Mouse and touch disambiguate "tap" differently (mouse defers to a pending-click
  // check on mouseup so a drag can turn into a pan; touch acts immediately on
  // touchstart), so the two input paths can't fully share a single event handler.
  // What they do share is what happens once a tap is confirmed — hit-testing plus the
  // resulting dispatch — which is factored out here and called from both paths below.
  // ---------------------------------------------------------------------------

  // Select mode: hit-tests edges at the tap point (called after node hit-testing has
  // already come up empty). Opens the edge editor and selects the edge if one is hit,
  // otherwise deselects everything.
  const trySelectEdgeAt = (screenX: number, screenY: number) => {
    const sectionNodes = getSectionNodes();
    const sectionEdges = getSectionEdges(sectionNodes);
    const nodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
    const canvas = canvasRef.current!;
    const W = canvas.width;
    const H = contentHRef.current;
    for (const edge of sectionEdges) {
      const src = nodeIndex.get(edge.srcId)!;
      const tgt = nodeIndex.get(edge.tgtId)!;
      const { x: ex, y: ey } = contentToScreen(src.nx * W, src.ny * H);
      const { x: tx, y: ty } = contentToScreen(tgt.nx * W, tgt.ny * H);
      if (distanceToSegment(screenX, screenY, ex, ey, tx, ty) < 6) {
        onEditorStateChange({ selectedEdgeId: edge.id, selectedNodeId: null });
        setEdgeEditor({ edgeId: edge.id, screenX: (ex + tx) / 2, screenY: (ey + ty) / 2 });
        return;
      }
    }
    onEditorStateChange({ selectedNodeId: null, selectedEdgeId: null });
  };

  // Select mode: hit-tests a node at the tap point and opens its label editor.
  // Used by both double-click (mouse) and double-tap (touch).
  const tryOpenLabelEditorAt = (screenX: number, screenY: number): boolean => {
    const sectionNodes = getSectionNodes();
    for (const node of sectionNodes) {
      if (!hitNodeScreen(screenX, screenY, node)) continue;
      setEdgeEditor(null);
      const canvas = canvasRef.current!;
      const nodeScreen = contentToScreen(node.nx * canvas.width, node.ny * contentHRef.current);
      setLabelEditor({
        nodeId: node.id,
        screenX: nodeScreen.x,
        screenY: nodeScreen.y,
        label: node.label,
        isRoom: node.isRoom,
        isConnector: node.isConnector,
        category: node.category ?? '',
        isRoomMarker: node.isRoomMarker ?? false,
        aliases: (node.aliases ?? []).join(', '),
      });
      return true;
    }
    return false;
  };

  // Path mode (auto-connect): if snap-to-axis is also on and there's a previous node to
  // connect from, snap a content-space point to align with it on whichever axis needs
  // the smaller correction. Shared by the click/tap handler and the live cursor preview
  // so both agree on exactly where the next node will land.
  function applyAxisSnap(x: number, y: number, W: number, H: number): { x: number; y: number } {
    const es = esRef.current;
    if (!(pathModeActive && es.snapToAxis && es.lastPathNodeId)) return { x, y };
    const prevNode = buildingRef.current.nodes.find((n) => n.id === es.lastPathNodeId);
    if (!prevNode) return { x, y };
    const prevX = prevNode.nx * W;
    const prevY = prevNode.ny * H;
    return Math.abs(x - prevX) >= Math.abs(y - prevY) ? { x, y: prevY } : { x: prevX, y };
  }

  // An edge touching a room marker is always a "Room Entrance" edge, regardless of
  // whatever type is selected in the toolbar — never a manual choice. Two markers
  // can't be connected to each other (a room can't be another room's entrance), so
  // that case is refused entirely (returns null; caller should cancel, not dispatch).
  function resolveEdgeType(srcNode: Node, tgtNode: Node, requestedType: EdgeType): EdgeType | null {
    const srcIsMarker = !!srcNode.isRoomMarker;
    const tgtIsMarker = !!tgtNode.isRoomMarker;
    if (srcIsMarker && tgtIsMarker) return null;
    if (srcIsMarker || tgtIsMarker) return ROOM_ENTRANCE_EDGE_TYPE;
    return requestedType;
  }

  // Node mode: places a new unlabeled node at the tap point, or splits an existing
  // edge into two if the tap landed on one. When path mode (auto-connect) is active,
  // also wires an edge from the previous path node and continues the chain; when
  // snap-to-axis is also on, the tap point is first snapped to align with the
  // previous node on whichever axis needs the smaller correction.
  const placeOrSplitNodeAt = (screenX: number, screenY: number) => {
    const sectionId = activeSectionIdRef.current;
    if (!sectionId) return;
    const canvas = canvasRef.current!;
    const W = canvas.width;
    const H = contentHRef.current;
    const es = esRef.current;
    const raw = screenToCanvas(screenX, screenY, zoomPanRef.current);
    const { x, y } = applyAxisSnap(raw.x, raw.y, W, H);

    const norm = px2norm(x, y, W, H);
    const clamped = { x: Math.max(0, Math.min(1, norm.x)), y: Math.max(0, Math.min(1, norm.y)) };
    const { x: tapScreenX, y: tapScreenY } = contentToScreen(x, y);

    const newNode: Node = {
      id: generateId(),
      sectionId,
      nx: clamped.x,
      ny: clamped.y,
      label: '',
      isRoom: false,
      isConnector: false,
    };

    const sectionNodes = getSectionNodes();
    const sectionEdges = getSectionEdges(sectionNodes);
    const edgeNodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
    let split = false;
    for (const edge of sectionEdges) {
      if (edge.type === ROOM_ENTRANCE_EDGE_TYPE) continue; // not spatial — not splittable
      const edgeSrc = edgeNodeIndex.get(edge.srcId)!;
      const edgeTgt = edgeNodeIndex.get(edge.tgtId)!;
      const { x: esx, y: esy } = contentToScreen(edgeSrc.nx * W, edgeSrc.ny * H);
      const { x: etx, y: ety } = contentToScreen(edgeTgt.nx * W, edgeTgt.ny * H);
      if (distanceToSegment(tapScreenX, tapScreenY, esx, esy, etx, ety) < 8) {
        const onEdge = closestPointOnSegment(x, y, edgeSrc.nx * W, edgeSrc.ny * H, edgeTgt.nx * W, edgeTgt.ny * H);
        const onEdgeNorm = px2norm(onEdge.x, onEdge.y, W, H);
        newNode.nx = onEdgeNorm.x;
        newNode.ny = onEdgeNorm.y;
        dispatch({ type: 'SPLIT_EDGE', payload: { edgeId: edge.id, nx: onEdgeNorm.x, ny: onEdgeNorm.y, newNodeId: newNode.id }, canvasW: W, canvasH: H });
        split = true;
        break;
      }
    }
    if (!split) {
      dispatch({ type: 'ADD_NODE', payload: newNode });
    }

    if (pathModeActive) {
      if (es.lastPathNodeId) {
        const prevNode = buildingRef.current.nodes.find((n) => n.id === es.lastPathNodeId);
        if (prevNode) {
          const activeSection = buildingRef.current.sections.find((s) => s.id === sectionId);
          const imgW = activeSection?.imageW ?? W;
          const imgH = activeSection?.imageH ?? H;
          const sectionScale = activeSection?.scale ?? 1.0;
          const type = resolveEdgeType(prevNode, newNode, es.currentEdgeType);
          if (type) {
            const typeDef = buildingRef.current.edgeTypes.find((t) => t.id === type);
            const weight = typeDef
              ? computeEdgeWeight(typeDef, prevNode, newNode, imgW, imgH, sectionScale)
              : euclideanWeight(prevNode, newNode, imgW, imgH) * sectionScale;
            dispatch({
              type: 'ADD_EDGE',
              payload: { srcId: es.lastPathNodeId, tgtId: newNode.id, type, weight, crossSection: false },
            });
          }
        }
      }
      onEditorStateChange({ lastPathNodeId: newNode.id, mousePos: null });
    }
  };

  // Edge mode: hit-tests nodes at the tap point and begins/cancels/completes a pending
  // edge accordingly. Returns true if a node was hit (and thus handled), so callers can
  // decide what "no node hit" means for their input method.
  const tryHandleEdgeModeTap = (screenX: number, screenY: number): boolean => {
    const es = esRef.current;
    const canvas = canvasRef.current!;
    const W = canvas.width;
    const H = contentHRef.current;
    const sectionNodes = getSectionNodes();
    const nodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
    for (const node of sectionNodes) {
      if (!hitNodeScreen(screenX, screenY, node)) continue;
      if (!es.pendingEdgeSrcId) {
        onEditorStateChange({ pendingEdgeSrcId: node.id });
        return true;
      }
      if (es.pendingEdgeSrcId === node.id) {
        onEditorStateChange({ pendingEdgeSrcId: null });
        return true;
      }
      const srcNode = nodeIndex.get(es.pendingEdgeSrcId);
      if (!srcNode) return true;
      const type = resolveEdgeType(srcNode, node, es.currentEdgeType);
      if (type) {
        const typeDef = buildingRef.current.edgeTypes.find((t) => t.id === type);
        const activeSection = buildingRef.current.sections.find((s) => s.id === activeSectionIdRef.current);
        const imgW = activeSection?.imageW ?? W;
        const imgH = activeSection?.imageH ?? H;
        const sectionScale = activeSection?.scale ?? 1.0;
        const weight = typeDef
          ? computeEdgeWeight(typeDef, srcNode, node, imgW, imgH, sectionScale)
          : euclideanWeight(srcNode, node, imgW, imgH) * sectionScale;
        dispatch({
          type: 'ADD_EDGE',
          payload: { srcId: es.pendingEdgeSrcId, tgtId: node.id, type, weight, crossSection: false },
        });
      }
      onEditorStateChange({ pendingEdgeSrcId: null });
      return true;
    }
    return false;
  };

  // Link mode: hit-tests connector nodes at the tap point and completes the pending
  // cross-section link if one is hit. Returns true if a node was hit (whether or not
  // it was a valid connector), so callers' "no node hit" fallback doesn't double-fire.
  const tryHandleLinkModeTap = (screenX: number, screenY: number): boolean => {
    const es = esRef.current;
    if (!es.pendingLinkSrc) return false;
    const sectionNodes = getSectionNodes();
    for (const node of sectionNodes) {
      if (!hitNodeScreen(screenX, screenY, node)) continue;
      if (!node.isConnector) return true; // only connector nodes can be cross-section targets
      const srcNode = buildingRef.current.nodes.find((n) => n.id === es.pendingLinkSrc!.nodeId);
      const type = srcNode ? resolveEdgeType(srcNode, node, es.currentEdgeType) : es.currentEdgeType;
      if (type) {
        const typeDef = buildingRef.current.edgeTypes.find((t) => t.id === type);
        const weight = typeDef?.weightMode === 'fixed' ? typeDef.fixedWeight : 100;
        dispatch({
          type: 'ADD_EDGE',
          payload: { srcId: es.pendingLinkSrc.nodeId, tgtId: node.id, type, weight, crossSection: true },
        });
      }
      onEditorStateChange({ mode: 'select', pendingLinkSrc: null });
      return true;
    }
    return false;
  };

  // Calibrate mode: records the tap as calibration point A or B (content-space coords).
  const handleCalibrateTap = (contentX: number, contentY: number) => {
    const es = esRef.current;
    if (es.mode !== 'calibrate' || calibratePopup) return;
    const canvas = canvasRef.current!;
    const norm = px2norm(contentX, contentY, canvas.width, contentHRef.current);
    const clampedNx = Math.max(0, Math.min(1, norm.x));
    const clampedNy = Math.max(0, Math.min(1, norm.y));
    if (!es.calibrateA) {
      onEditorStateChange({ calibrateA: { nx: clampedNx, ny: clampedNy } });
    } else {
      const b = { nx: clampedNx, ny: clampedNy };
      onEditorStateChange({ calibrateB: b, mousePos: null });
      setCalibratePopup({ a: es.calibrateA, b, distance: '' });
    }
  };

  // ---------------------------------------------------------------------------
  // Adjust-image mode: pan/rescale a section's image independent of node nx/ny,
  // so a newly swapped-in image can be realigned under existing annotations.
  // ---------------------------------------------------------------------------

  const IMAGE_ZOOM_STEP = 0.25;
  const IMAGE_MIN_SCALE = 0.1;
  const IMAGE_MAX_SCALE = 8;

  const getActiveSection = () =>
    buildingRef.current.sections.find((s) => s.id === activeSectionIdRef.current) ?? null;

  // Pans the active section's image by a delta given in raw screen px, converting
  // through the current view zoom into normalized offset fractions. `coalesce` groups
  // an in-progress drag into a single undo step, mirroring node-drag's `moved` gating.
  const applyImageOffsetDelta = (dxScreen: number, dyScreen: number, coalesce: boolean) => {
    const section = getActiveSection();
    const canvas = canvasRef.current;
    if (!section || !canvas) return;
    const W = canvas.width;
    const H = contentHRef.current;
    const scale = zoomPanRef.current.scale;
    dispatch({
      type: 'UPDATE_SECTION_IMAGE_TRANSFORM',
      payload: {
        id: section.id,
        imageOffsetX: (section.imageOffsetX ?? 0) + dxScreen / scale / W,
        imageOffsetY: (section.imageOffsetY ?? 0) + dyScreen / scale / H,
        imageScale: section.imageScale ?? 1,
      },
      coalesce,
    });
  };

  // Rescales the active section's image by `factor`, anchored at the content-rect
  // center (normalized 0.5, 0.5) so the visually-centered point stays fixed —
  // same anchor-preserving formula as useZoomPan's zoomAt, applied to normalized
  // offset/scale fields instead of pixel pan/scale.
  const applyImageZoom = (factor: number) => {
    const section = getActiveSection();
    if (!section) return;
    const prevScale = section.imageScale ?? 1;
    const newScale = Math.min(IMAGE_MAX_SCALE, Math.max(IMAGE_MIN_SCALE, prevScale * factor));
    const prevOffsetX = section.imageOffsetX ?? 0;
    const prevOffsetY = section.imageOffsetY ?? 0;
    const anchor = 0.5;
    dispatch({
      type: 'UPDATE_SECTION_IMAGE_TRANSFORM',
      payload: {
        id: section.id,
        imageOffsetX: anchor - (anchor - prevOffsetX) * (newScale / prevScale),
        imageOffsetY: anchor - (anchor - prevOffsetY) * (newScale / prevScale),
        imageScale: newScale,
      },
    });
  };

  const handleImageZoomIn = () => applyImageZoom(1 + IMAGE_ZOOM_STEP);
  const handleImageZoomOut = () => applyImageZoom(1 / (1 + IMAGE_ZOOM_STEP));

  const handleImageReset = () => {
    const section = getActiveSection();
    if (!section) return;
    dispatch({
      type: 'UPDATE_SECTION_IMAGE_TRANSFORM',
      payload: { id: section.id, imageOffsetX: 0, imageOffsetY: 0, imageScale: 1 },
    });
  };

  const handleImageAdjustDone = () => {
    onEditorStateChange({ mode: 'select' });
  };

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

    // Adjust-image mode — drag pans the image directly, no click/select competing for it
    if (esRef.current.mode === 'adjust-image') {
      imageDragRef.current = { lastX: screen.x, lastY: screen.y, moved: false };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    // Pan mode — drag always pans the view, no node/edge hit-testing competing for it
    if (esRef.current.mode === 'pan') {
      panRef.current = { lastX: screen.x, lastY: screen.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    const { x, y } = getContentCoords(e);
    const es = esRef.current;
    const sectionNodes = getSectionNodes();

    if (es.mode === 'select') {
      setLabelEditor(null);
      setEdgeEditor(null);

      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) {
          onEditorStateChange({ selectedNodeId: node.id, selectedEdgeId: null });
          dragRef.current = { nodeId: node.id, moved: false };
          return;
        }
      }

      // No node hit — set up pending action: pan on drag, click-to-select/deselect on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    if (es.mode === 'node') {
      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) {
          if (pathModeActive && node.id === es.lastPathNodeId) {
            onEditorStateChange({ lastPathNodeId: null, mousePos: null });
          } else if (pathModeActive) {
            // Clicking a different existing node re-anchors the chain to it
            onEditorStateChange({ lastPathNodeId: node.id, mousePos: null });
          }
          return;
        }
      }
      if (!activeSectionIdRef.current) return;
      // Set up pending action: pan on drag, place/split on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    if (es.mode === 'edge') {
      if (tryHandleEdgeModeTap(screen.x, screen.y)) return;
      // No node hit — set up pending action: pan on drag, cancel pending edge on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    if (es.mode === 'link' && es.pendingLinkSrc) {
      if (tryHandleLinkModeTap(screen.x, screen.y)) return;
      // No node hit — set up pending action: pan on drag, cancel link on release
      pendingClickRef.current = { startX: screen.x, startY: screen.y, panned: false };
    }

    handleCalibrateTap(x, y);
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

    // Pointer cursor when hovering a node, taking priority over the mode's default cursor
    const hovered = getSectionNodes().some((n) => hitNodeScreen(screen.x, screen.y, n));
    if (hovered !== hoverNodeRef.current) {
      hoverNodeRef.current = hovered;
      updateCursor();
    }

    // Rubber-band preview: store mouse in content coords
    if (es.mode === 'edge' || (es.mode === 'calibrate' && es.calibrateA && !calibratePopup)) {
      onEditorStateChange({ mousePos: { x, y } });
    } else if (es.mode === 'node' && pathModeActive && es.lastPathNodeId) {
      onEditorStateChange({ mousePos: applyAxisSnap(x, y, W, H) });
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
        coalesce: dragRef.current.moved,
      });
      dragRef.current.moved = true;
    }

    // Drag image (adjust-image mode)
    if (imageDragRef.current && es.mode === 'adjust-image') {
      const dxScreen = screen.x - imageDragRef.current.lastX;
      const dyScreen = screen.y - imageDragRef.current.lastY;
      imageDragRef.current.lastX = screen.x;
      imageDragRef.current.lastY = screen.y;
      applyImageOffsetDelta(dxScreen, dyScreen, imageDragRef.current.moved);
      imageDragRef.current.moved = true;
    }

  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (pendingClickRef.current) {
      if (!pendingClickRef.current.panned) {
        const es = esRef.current;
        const sx = pendingClickRef.current.startX;
        const sy = pendingClickRef.current.startY;

        if (es.mode === 'select') {
          trySelectEdgeAt(sx, sy);
        }

        if (es.mode === 'node' && activeSectionIdRef.current) {
          placeOrSplitNodeAt(sx, sy);
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
    if (imageDragRef.current) {
      imageDragRef.current = null;
      updateCursor();
    }
  };

  const handleDblClick = (e: React.MouseEvent) => {
    if (esRef.current.mode !== 'select') return;
    const screen = getScreenCoords(e);
    tryOpenLabelEditorAt(screen.x, screen.y);
  };

  const handleMouseLeave = () => {
    if (esRef.current.mode === 'edge' || esRef.current.mode === 'calibrate' || esRef.current.mode === 'node') {
      onEditorStateChange({ mousePos: null });
    }
    hoverNodeRef.current = false;
    if (panRef.current && !spaceRef.current) {
      panRef.current = null;
    }
    imageDragRef.current = null;
    updateCursor();
    pendingClickRef.current = null;
  };

  // ---------------------------------------------------------------------------
  // Touch events (reuse same hit-test and dispatch logic as mouse handlers)
  // ---------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      // A second finger touching down starts a pinch-zoom gesture — cancel any
      // pending single-touch action (drag/tap) so it doesn't also fire.
      dragRef.current = null;
      imageDragRef.current = null;
      lastTapRef.current = null;
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      touchRef.current = { lastX: midX - rect.left, lastY: midY - rect.top, lastDist: dist };
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = t.clientX - rect.left;
    const sy = t.clientY - rect.top;

    touchRef.current = { lastX: t.clientX, lastY: t.clientY, lastDist: 0 };
    imageDragRef.current = null;

    // Pan mode — single-finger drag always pans, no node/edge hit-testing or tap dispatch
    if (esRef.current.mode === 'pan') {
      lastTapRef.current = null;
      return;
    }

    // Double-tap detection — fire label editor open if two taps within 300ms/20px
    const now = Date.now();
    const last = lastTapRef.current;
    if (last && now - last.time < 300 && Math.hypot(sx - last.x, sy - last.y) < 20) {
      lastTapRef.current = null;
      if (esRef.current.mode === 'select') tryOpenLabelEditorAt(sx, sy);
      return;
    }
    lastTapRef.current = { time: now, x: sx, y: sy };

    // Synthesize a mouse-down equivalent using screen coords
    const { x, y } = screenToCanvas(sx, sy, zoomPanRef.current);
    const es = esRef.current;
    const sectionNodes = getSectionNodes();

    if (es.mode === 'select') {
      setLabelEditor(null);
      setEdgeEditor(null);
      for (const node of sectionNodes) {
        if (hitNodeScreen(sx, sy, node)) {
          onEditorStateChange({ selectedNodeId: node.id, selectedEdgeId: null });
          dragRef.current = { nodeId: node.id, moved: false };
          return;
        }
      }
      trySelectEdgeAt(sx, sy);
    }

    if (es.mode === 'node') {
      for (const node of sectionNodes) {
        if (hitNodeScreen(sx, sy, node)) {
          if (pathModeActive && node.id === es.lastPathNodeId) {
            onEditorStateChange({ lastPathNodeId: null, mousePos: null });
          } else if (pathModeActive) {
            // Tapping a different existing node re-anchors the chain to it
            onEditorStateChange({ lastPathNodeId: node.id, mousePos: null });
          }
          return;
        }
      }
      placeOrSplitNodeAt(sx, sy);
    }

    if (es.mode === 'edge') {
      if (tryHandleEdgeModeTap(sx, sy)) return;
      if (es.pendingEdgeSrcId) onEditorStateChange({ pendingEdgeSrcId: null });
    }

    if (es.mode === 'link' && es.pendingLinkSrc) {
      if (!tryHandleLinkModeTap(sx, sy)) {
        onEditorStateChange({ mode: 'select', pendingLinkSrc: null });
      }
    }

    handleCalibrateTap(x, y);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current) return;

    if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const sx = midX - rect.left;
      const sy = midY - rect.top;

      if (touchRef.current.lastDist > 0) {
        const factor = dist / touchRef.current.lastDist;
        onZoomAt(sx, sy, zoomPanRef.current.scale * factor);
        onPan(sx - touchRef.current.lastX, sy - touchRef.current.lastY);
      }

      touchRef.current = { lastX: sx, lastY: sy, lastDist: dist };
      return;
    }

    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - touchRef.current.lastX;
    const dy = t.clientY - touchRef.current.lastY;
    touchRef.current = { lastX: t.clientX, lastY: t.clientY, lastDist: 0 };

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
    } else if (es.mode === 'node' && pathModeActive && es.lastPathNodeId) {
      onEditorStateChange({ mousePos: applyAxisSnap(x, y, W, H) });
    }

    if (dragRef.current && es.mode === 'select') {
      const norm = px2norm(x, y, W, H);
      dispatch({
        type: 'UPDATE_NODE',
        payload: { id: dragRef.current.nodeId, nx: Math.max(0, Math.min(1, norm.x)), ny: Math.max(0, Math.min(1, norm.y)) },
        canvasW: W,
        canvasH: H,
        coalesce: dragRef.current.moved,
      });
      dragRef.current.moved = true;
      return;
    }

    if (es.mode === 'adjust-image') {
      const moved = imageDragRef.current?.moved ?? false;
      applyImageOffsetDelta(dx, dy, moved);
      imageDragRef.current = { lastX: t.clientX, lastY: t.clientY, moved: true };
      return;
    }

    onPan(dx, dy);
  };

  const handleTouchEnd = () => {
    touchRef.current = null;
    dragRef.current = null;
    imageDragRef.current = null;
    if (esRef.current.mode === 'edge' || esRef.current.mode === 'calibrate' || esRef.current.mode === 'node') {
      onEditorStateChange({ mousePos: null });
    }
  };

  // ---------------------------------------------------------------------------
  // Label editor
  // ---------------------------------------------------------------------------

  const submitLabelEditor = () => {
    if (!labelEditor) return;
    const parsedAliases = labelEditor.isRoom ? parseAliases(labelEditor.aliases, labelEditor.label) : [];
    dispatch({
      type: 'UPDATE_NODE',
      payload: {
        id: labelEditor.nodeId,
        label: labelEditor.label,
        isRoom: labelEditor.isRoom,
        isConnector: labelEditor.isConnector,
        category: labelEditor.isRoom && labelEditor.category.trim() ? labelEditor.category.trim() : undefined,
        aliases: parsedAliases.length > 0 ? parsedAliases : undefined,
      },
    });
    setLabelEditor(null);
  };

  // Marking/unmarking a room marker acts immediately (independent of the popup's Save
  // button) since it's a distinct, consequential action — marking cascades into a
  // confirmed edge conversion/deletion, so it gets its own explicit confirmation
  // moment rather than being silently bundled into an unrelated field's Save.
  const handleToggleMarker = (checked: boolean) => {
    if (!labelEditor) return;
    const nodeId = labelEditor.nodeId;
    if (!checked) {
      dispatch({ type: 'UNSET_ROOM_MARKER', payload: { nodeId } });
      setLabelEditor({ ...labelEditor, isRoomMarker: false });
      return;
    }
    const roomIds = new Set(buildingRef.current.nodes.filter((n) => n.isRoom).map((n) => n.id));
    const touching = buildingRef.current.edges.filter((e) => e.srcId === nodeId || e.tgtId === nodeId);
    if (touching.length > 0) {
      const toConvert = touching.filter((e) => !roomIds.has(e.srcId === nodeId ? e.tgtId : e.srcId)).length;
      const toDelete = touching.length - toConvert;
      const parts: string[] = [];
      if (toConvert > 0) parts.push(`convert ${toConvert} edge${toConvert === 1 ? '' : 's'} to room entrances`);
      if (toDelete > 0) parts.push(`delete ${toDelete} edge${toDelete === 1 ? '' : 's'} to other rooms`);
      const detail = parts.length ? ` This will ${parts.join(' and ')}.` : '';
      const confirmed = window.confirm(
        `Make this node a room marker?${detail} It will be removed from the pathfinding graph, and its label/category will be used for whichever entrance is selected when routing to this room.`,
      );
      if (!confirmed) return;
    }
    dispatch({ type: 'SET_ROOM_MARKER', payload: { nodeId } });
    setLabelEditor({ ...labelEditor, isRoomMarker: true });
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
    const currentEdge = building.edges.find((e) => e.id === edgeEditor.edgeId);
    if (currentEdge?.type === ROOM_ENTRANCE_EDGE_TYPE) return;
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
  const existingCategories = getDistinctCategories(building.nodes);
  const canvasW = canvasRef.current?.width ?? 400;

  const closePopups = () => { setLabelEditor(null); setEdgeEditor(null); setCalibratePopup(null); onEditorStateChange({ calibrateA: null, calibrateB: null }); };

  // Clamp the label/edge editor popups so they never extend past the bottom of the
  // visible canvas — measured against each popup's actual rendered height (which
  // varies with its content) rather than a fixed guess, so it stays correct however
  // many fields a popup happens to be showing.
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || isSmall) return;
    const margin = 8;
    const clamp = (el: HTMLDivElement | null, desiredTop: number) => {
      if (!el) return;
      const maxTop = Math.max(margin, canvas.height - el.offsetHeight - margin);
      el.style.top = `${Math.max(margin, Math.min(desiredTop, maxTop))}px`;
    };
    if (labelEditor) clamp(labelPopupRef.current, labelEditor.screenY + 16);
    if (edgeEditor) clamp(edgePopupRef.current, edgeEditor.screenY + 8);
  }, [labelEditor, edgeEditor, isSmall]);

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
            ref={labelPopupRef}
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
                  disabled={labelEditor.isRoomMarker}
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
                  list="category-options"
                />
                <datalist id="category-options">
                  {existingCategories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
            )}
            {labelEditor.isRoom && (
              <div className={popupStyles.popupRow}>
                <label className={popupStyles.popupLabel}>Aliases</label>
                <input
                  className={clsx(popupStyles.popupInput, isSmall && popupStyles.popupInputSheet)}
                  placeholder="comma-separated, e.g. Server Room, IT Closet"
                  value={labelEditor.aliases}
                  onChange={(ev) => setLabelEditor({ ...labelEditor, aliases: ev.target.value })}
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
            {labelEditor.isRoom && (
              <div className={popupStyles.popupRow}>
                <label className={popupStyles.checkLabel}>
                  <input
                    type="checkbox"
                    checked={labelEditor.isRoomMarker}
                    onChange={(ev) => handleToggleMarker(ev.target.checked)}
                  />
                  <span>Room marker</span>
                </label>
              </div>
            )}
            {labelEditor.isRoomMarker &&
              getRoomEntranceIds(buildingRef.current.edges, labelEditor.nodeId).length === 0 && (
                <div className={popupStyles.popupWarning}>
                  No entrances — this room can't be routed to.
                </div>
              )}
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
            ref={edgePopupRef}
            className={isSmall ? popupStyles.bottomSheet : popupStyles.popup}
            style={isSmall ? undefined : {
              left: Math.min(edgeEditor.screenX + 8, canvasW - 200),
              top: edgeEditor.screenY + 8,
            }}
          >
            {isSmall && <div className={popupStyles.dragHandle} />}
            {building.edges.find((e) => e.id === edgeEditor.edgeId)?.type === ROOM_ENTRANCE_EDGE_TYPE ? (
              <div className={popupStyles.popupHint}>Room entrance edge — type can't be changed</div>
            ) : (
              <div className={popupStyles.edgeTypeBtnRow}>
                {building.edgeTypes.filter((t) => t.id !== ROOM_ENTRANCE_EDGE_TYPE).map((typeDef) => {
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
            )}
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

      {/* Adjust-image mode banner — no full-screen backdrop (unlike the other popups):
          the whole point of this mode is dragging the canvas underneath to pan the image,
          so the map must stay interactive while this banner is showing. */}
      {editorState.mode === 'adjust-image' && (
        <div
          className={isSmall ? popupStyles.bottomSheet : popupStyles.popup}
          style={isSmall ? undefined : { left: Math.min(canvasW / 2 - 130, canvasW - 260), top: 60 }}
        >
          <div className={popupStyles.popupRow}>
            <label className={popupStyles.popupLabel}>Adjusting image — drag to pan</label>
          </div>
          <div className={popupStyles.popupActions}>
            <button className={popupStyles.popupBtn} onClick={handleImageZoomOut} title="Zoom out">−</button>
            <button className={popupStyles.popupBtn} onClick={handleImageZoomIn} title="Zoom in">+</button>
            <button className={popupStyles.popupBtn} onClick={handleImageReset}>Reset</button>
            <button className={clsx(popupStyles.popupBtn, popupStyles.popupBtnPrimary)} onClick={handleImageAdjustDone}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
