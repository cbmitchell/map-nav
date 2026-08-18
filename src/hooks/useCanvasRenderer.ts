import { useCallback, useLayoutEffect, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import type { Building, EdgeTypeDef, Node } from '../types/graph';
import type { EditorState } from '../types/editor';
import { DEFAULT_EDITOR_STATE } from '../types/editor';
import type { ZoomPanState } from './useZoomPan';
import { DEFAULT_ZOOM_PAN } from './useZoomPan';
import { ROOM_ENTRANCE_EDGE_TYPE, getImpersonatingMarker, getUnreachableMarkerIds } from '../utils/roomEntrances';

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
const NODE_DIM_ALPHA = 0.5;
const EMPTY_HIDDEN_SET = new Set<string>();
const EMPTY_FAVORITES_SET = new Set<string>();

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
  isNavigator = false,
  hiddenCategories: Set<string> = EMPTY_HIDDEN_SET,
  favorites: Set<string> = EMPTY_FAVORITES_SET,
  originRoomId: string | null = null,
  destinationRoomId: string | null = null,
) {
  const buildingRef = useRef(building);
  const activeSectionIdRef = useRef(activeSectionId);
  const editorStateRef = useRef(editorState);
  const zoomPanRef = useRef(zoomPan);
  const highlightPathRef = useRef(highlightPath);
  const roomsOnlyRef = useRef(roomsOnly);
  const isNavigatorRef = useRef(isNavigator);
  const hiddenCategoriesRef = useRef(hiddenCategories);
  const favoritesRef = useRef(favorites);
  const originRoomIdRef = useRef(originRoomId);
  const destinationRoomIdRef = useRef(destinationRoomId);
  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const redrawRef = useRef<() => void>(() => {});

  useLayoutEffect(() => {
    buildingRef.current = building;
    activeSectionIdRef.current = activeSectionId;
    editorStateRef.current = editorState;
    zoomPanRef.current = zoomPan;
    highlightPathRef.current = highlightPath;
    roomsOnlyRef.current = roomsOnly;
    isNavigatorRef.current = isNavigator;
    hiddenCategoriesRef.current = hiddenCategories;
    favoritesRef.current = favorites;
    originRoomIdRef.current = originRoomId;
    destinationRoomIdRef.current = destinationRoomId;
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
    const isNavigator = isNavigatorRef.current;
    const hiddenCategories = hiddenCategoriesRef.current;
    const favorites = favoritesRef.current;
    const originRoomId = originRoomIdRef.current;
    const destinationRoomId = destinationRoomIdRef.current;

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

    // A node whose category is hidden is treated as normal (never hidden) while it's
    // part of the active path — mirrors the room-marker impersonation precedent below,
    // so a routed-to node stays visible/clickable for the duration of the route.
    const isCategoryHidden = (n: Node) =>
      !!(n.category && hiddenCategories.has(n.category)) && !(pathNodeSet && pathNodeSet.has(n.id));

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
        const offX = (section.imageOffsetX ?? 0) * W;
        const offY = (section.imageOffsetY ?? 0) * contentH;
        const s = section.imageScale ?? 1;
        ctx.drawImage(img, offX, offY, W * s, contentH * s);
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
      if (isNavigator && e.type === ROOM_ENTRANCE_EDGE_TYPE) return false; // organizational only
      if (!nodeIndex.has(e.srcId) || !nodeIndex.has(e.tgtId)) return false;
      const src = nodeIndex.get(e.srcId)!;
      const tgt = nodeIndex.get(e.tgtId)!;
      if (src.sectionId !== activeSectionId || tgt.sectionId !== activeSectionId) return false;
      if (isCategoryHidden(src) || isCategoryHidden(tgt)) return false;
      return true;
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

      // Directional arrowhead for Room Entrance edges (marker → entrance), editor
      // only — Navigator never draws these edges at all (filtered out above).
      if (edge.type === ROOM_ENTRANCE_EDGE_TYPE && !isNavigator) {
        const markerIsSrc = !!src.isRoomMarker;
        const fromX = markerIsSrc ? sx : tx;
        const fromY = markerIsSrc ? sy : ty;
        const toX = markerIsSrc ? tx : sx;
        const toY = markerIsSrc ? ty : sy;
        const angle = Math.atan2(toY - fromY, toX - fromX);
        const arrowLen = 9;
        const arrowAngle = Math.PI / 7;
        ctx.beginPath();
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - arrowLen * Math.cos(angle - arrowAngle), toY - arrowLen * Math.sin(angle - arrowAngle));
        ctx.moveTo(toX, toY);
        ctx.lineTo(toX - arrowLen * Math.cos(angle + arrowAngle), toY - arrowLen * Math.sin(angle + arrowAngle));
        ctx.strokeStyle = edgeLookups.colors[edge.type] ?? '#888';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Edge weight label (editor only) — skipped for Room Entrance, weight is inert
      if (!isPathMode && edge.type !== ROOM_ENTRANCE_EDGE_TYPE) {
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
      // On-path edges are drawn later (see the Nodes section below), after the dimmed
      // off-path nodes — otherwise a dense cluster of dimmed nodes can visually bury
      // the highlighted route line when zoomed out.
      ctx.globalAlpha = DIM_ALPHA;
      for (const edge of sectionEdges) {
        const onPath = pathEdgePairs.has(`${edge.srcId}|${edge.tgtId}`);
        if (!onPath) drawEdge(edge, false);
      }
      ctx.globalAlpha = 1;
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

    // 4a. Node-path (auto-connect) preview — dim node + edge following the cursor
    if (es.mode === 'node' && es.autoConnectEnabled && es.lastPathNodeId && es.mousePos) {
      const prevNode = nodeIndex.get(es.lastPathNodeId);
      if (prevNode) {
        const prevScreen = toScreen(prevNode.nx * W, prevNode.ny * contentH);
        const previewScreen = toScreen(es.mousePos.x, es.mousePos.y);

        ctx.globalAlpha = NODE_DIM_ALPHA;

        ctx.beginPath();
        ctx.moveTo(prevScreen.x, prevScreen.y);
        ctx.lineTo(previewScreen.x, previewScreen.y);
        ctx.strokeStyle = edgeLookups.colors[es.currentEdgeType] ?? '#888';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(previewScreen.x, previewScreen.y, 8, 0, Math.PI * 2);
        ctx.fillStyle = '#378ADD';
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

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

    // Room marker impersonation: while routing, the resolved entrance visually
    // becomes the room it belongs to (marker's label/styling), and the marker itself
    // hides — but only for the marker(s) actually tied to this path's endpoints;
    // unrelated markers elsewhere are unaffected.
    const entranceOverrides = new Map<string, typeof sectionNodes[number]>(); // entranceId -> marker
    const hiddenMarkerIds = new Set<string>();
    if (isNavigator && path && path.length > 0) {
      const originMarker = getImpersonatingMarker(building.nodes, originRoomId);
      if (originMarker) {
        entranceOverrides.set(path[0], originMarker);
        hiddenMarkerIds.add(originMarker.id);
      }
      // If origin and destination resolve to the same single-node path (e.g. a route
      // with literally one step), this overwrites the origin's entry — one canvas node
      // can't impersonate two rooms at once, so the destination wins the tie. Same
      // structural ceiling that existed before this fix, just no longer an arbitrary pick.
      const destinationMarker = getImpersonatingMarker(building.nodes, destinationRoomId);
      if (destinationMarker) {
        entranceOverrides.set(path[path.length - 1], destinationMarker);
        hiddenMarkerIds.add(destinationMarker.id);
      }
    }

    // Editor-only: markers with zero entrances can never be routed to — flag them
    // with a warning ring so the mapmaker notices before a user hits "No route found."
    const unreachableMarkerIds = isNavigator
      ? new Set<string>()
      : getUnreachableMarkerIds(sectionNodes, building.edges);

    // 5. Nodes (markers only — labels are drawn in a separate pass afterward, see
    // drawNodeLabel, so a node can never visually bury another node's label).
    const drawNode = (node: typeof sectionNodes[number], isPath: boolean) => {
      const { x, y } = toScreen(node.nx * W, node.ny * contentH);
      const overrideMarker = entranceOverrides.get(node.id);

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

      if (unreachableMarkerIds.has(node.id)) {
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.strokeStyle = '#E74C3C';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      let fillColor: string;
      if (node.id === es.selectedNodeId) fillColor = '#7C3AED';
      else if (node.id === es.pendingEdgeSrcId) fillColor = '#F97316';
      else if (overrideMarker) fillColor = '#1D9E75';
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

      // Favorite star badge — browsing only (never mid-route, where the path
      // highlight takes over the node's visual treatment).
      if (isNavigator && !isPathMode && favorites.has(node.id)) {
        ctx.beginPath();
        ctx.arc(x + 9, y - 9, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.65)';
        ctx.fill();
        ctx.font = 'bold 11px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#FFD24C';
        ctx.fillText('★', x + 9, y - 8);
      }
    };

    // Node label — substituted with the marker's label while this node is
    // impersonating the room it's an entrance of. Drawn in its own pass, after every
    // node marker, so labels always sit on top instead of being buried by a
    // later-drawn neighboring node.
    const drawNodeLabel = (node: typeof sectionNodes[number], isPath: boolean) => {
      const { x, y } = toScreen(node.nx * W, node.ny * contentH);
      const overrideMarker = entranceOverrides.get(node.id);
      const displayLabel = overrideMarker?.label || node.label;
      if (!displayLabel) return;
      ctx.font = '12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      const labelW = ctx.measureText(displayLabel).width;
      const pad = 3;
      const labelX = x - labelW / 2 - pad;
      const labelY = y + 12;
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(labelX, labelY, labelW + pad * 2, 16);
      ctx.fillStyle = isPath ? PATH_COLOR : '#fff';
      ctx.fillText(displayLabel, x, labelY + 2);
    };

    if (isPathMode) {
      const isSignificantNode = (n: typeof sectionNodes[number]) =>
        n.isRoom || n.isConnector || n.label !== '' || entranceOverrides.has(n.id);
      // Off-path nodes are only shown (dimmed) if they're rooms — except a room
      // marker currently being impersonated by its resolved entrance, which hides
      // entirely so only one node ever represents a given room on screen at a time.
      const isDimEligible = (n: typeof sectionNodes[number]) =>
        n.isRoom && !hiddenMarkerIds.has(n.id) && !isCategoryHidden(n);
      ctx.globalAlpha = NODE_DIM_ALPHA;
      for (const node of sectionNodes) {
        if (!pathNodeSet!.has(node.id) && isDimEligible(node)) drawNode(node, false);
      }
      ctx.globalAlpha = 1;
      // The highlighted route line is drawn above all off-path clutter (edges and
      // dimmed nodes alike), but still below the on-path nodes drawn next, so a node
      // sitting on the path is never obscured by the line passing through it.
      for (const edge of sectionEdges) {
        if (pathEdgePairs.has(`${edge.srcId}|${edge.tgtId}`)) drawEdge(edge, true);
      }
      for (const node of sectionNodes) {
        if (pathNodeSet!.has(node.id) && isSignificantNode(node)) drawNode(node, true);
      }
      // Labels last, above every marker drawn above — dimmed off-path labels keep
      // their dimmed alpha, on-path labels stay at full opacity.
      ctx.globalAlpha = NODE_DIM_ALPHA;
      for (const node of sectionNodes) {
        if (!pathNodeSet!.has(node.id) && isDimEligible(node)) drawNodeLabel(node, false);
      }
      ctx.globalAlpha = 1;
      for (const node of sectionNodes) {
        if (pathNodeSet!.has(node.id) && isSignificantNode(node)) drawNodeLabel(node, true);
      }
    } else {
      for (const node of sectionNodes) {
        if (isCategoryHidden(node)) continue;
        if (!roomsOnly || node.isRoom) drawNode(node, false);
      }
      for (const node of sectionNodes) {
        if (isCategoryHidden(node)) continue;
        if (!roomsOnly || node.isRoom) drawNodeLabel(node, false);
      }
    }

    // Reset transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }, [canvasRef]);

  useLayoutEffect(() => { redrawRef.current = redraw; }, [redraw]);

  useEffect(() => {
    redraw();
  }, [redraw, building, activeSectionId, editorState, zoomPan, highlightPath, roomsOnly, isNavigator, hiddenCategories, favorites, originRoomId, destinationRoomId]);

  return { redraw };
}
