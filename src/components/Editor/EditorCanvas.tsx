import { useRef, useState, useLayoutEffect, useEffect } from 'react';
import type { Dispatch } from 'react';
import type { Building, EdgeType, Node } from '../../types/graph';
import type { EditorState } from '../../types/editor';
import type { Action } from '../../hooks/useGraphReducer';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { screenToCanvas } from '../../hooks/useZoomPan';
import { useCanvasRenderer, EDGE_COLORS, EDGE_LABELS } from '../../hooks/useCanvasRenderer';
import { distanceToSegment, px2norm } from '../../utils/geometry';
import { FIXED_WEIGHTS } from '../../utils/pathfinding';
import { euclideanWeight } from '../../utils/geometry';

const ALL_EDGE_TYPES: EdgeType[] = ['walkway', 'stairs', 'elevator', 'ramp', 'bridge'];

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
  onZoomIn: (cx: number, cy: number) => void;
  onZoomOut: (cx: number, cy: number) => void;
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
}: EditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<{ nodeId: string } | null>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const spaceRef = useRef(false);
  const prevMouseRef = useRef<{ x: number; y: number } | null>(null);

  const [labelEditor, setLabelEditor] = useState<LabelEditorState | null>(null);
  const [edgeEditor, setEdgeEditor] = useState<EdgeEditorState | null>(null);

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
      const h = section?.imageW ? Math.round(w * section.imageH / section.imageW) : w;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      redraw();
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeSectionId, building.sections, redraw]);

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
    const map: Record<string, string> = { select: 'default', node: 'crosshair', edge: 'cell', link: 'crosshair' };
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
    const { x, y } = contentToScreen(node.nx * canvas.width, node.ny * canvas.height);
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
    prevMouseRef.current = screen;

    // Middle mouse button — start pan
    if (e.button === 1) {
      e.preventDefault();
      panRef.current = { lastX: screen.x, lastY: screen.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    if (e.button !== 0) return;

    // Space held — start pan
    if (spaceRef.current) {
      panRef.current = { lastX: screen.x, lastY: screen.y };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      return;
    }

    const { x, y } = getContentCoords(e);
    const canvas = canvasRef.current!;
    const W = canvas.width;
    const H = canvas.height;
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

      const sectionEdges = getSectionEdges(sectionNodes);
      const nodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
      for (const edge of sectionEdges) {
        const src = nodeIndex.get(edge.srcId)!;
        const tgt = nodeIndex.get(edge.tgtId)!;
        const { x: sx, y: sy } = contentToScreen(src.nx * W, src.ny * H);
        const { x: tx, y: ty } = contentToScreen(tgt.nx * W, tgt.ny * H);
        if (distanceToSegment(screen.x, screen.y, sx, sy, tx, ty) < 6) {
          onEditorStateChange({ selectedEdgeId: edge.id, selectedNodeId: null });
          setEdgeEditor({ edgeId: edge.id, screenX: (sx + tx) / 2, screenY: (sy + ty) / 2 });
          return;
        }
      }

      onEditorStateChange({ selectedNodeId: null, selectedEdgeId: null });
    }

    if (es.mode === 'node') {
      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) return;
      }
      if (!activeSectionIdRef.current) return;
      const norm = px2norm(x, y, W, H);
      const clampedNorm = {
        x: Math.max(0, Math.min(1, norm.x)),
        y: Math.max(0, Math.min(1, norm.y)),
      };

      // If the click lands near an existing edge, split it instead of placing a free node
      const sectionEdges = getSectionEdges(sectionNodes);
      const edgeNodeIndex = new Map(buildingRef.current.nodes.map((n) => [n.id, n]));
      for (const edge of sectionEdges) {
        const edgeSrc = edgeNodeIndex.get(edge.srcId)!;
        const edgeTgt = edgeNodeIndex.get(edge.tgtId)!;
        const { x: sx, y: sy } = contentToScreen(edgeSrc.nx * W, edgeSrc.ny * H);
        const { x: tx, y: ty } = contentToScreen(edgeTgt.nx * W, edgeTgt.ny * H);
        if (distanceToSegment(screen.x, screen.y, sx, sy, tx, ty) < 8) {
          dispatch({ type: 'SPLIT_EDGE', payload: { edgeId: edge.id, nx: clampedNorm.x, ny: clampedNorm.y }, canvasW: W, canvasH: H });
          return;
        }
      }

      dispatch({
        type: 'ADD_NODE',
        payload: {
          sectionId: activeSectionIdRef.current,
          nx: clampedNorm.x,
          ny: clampedNorm.y,
          label: '',
          isRoom: false,
          isConnector: false,
        },
      });
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
          const fixed = FIXED_WEIGHTS[type];
          const weight = fixed !== undefined ? fixed : euclideanWeight(srcNode, node, W, H);
          dispatch({
            type: 'ADD_EDGE',
            payload: { srcId: es.pendingEdgeSrcId, tgtId: node.id, type, weight, crossSection: false },
          });
          onEditorStateChange({ pendingEdgeSrcId: null });
          return;
        }
      }
      if (es.pendingEdgeSrcId) onEditorStateChange({ pendingEdgeSrcId: null });
    }

    if (es.mode === 'link' && es.pendingLinkSrc) {
      for (const node of sectionNodes) {
        if (hitNodeScreen(screen.x, screen.y, node)) {
          if (!node.isConnector) return; // only connector nodes can be cross-section targets
          const type = es.currentEdgeType;
          const weight = FIXED_WEIGHTS[type] ?? 100;
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
      // Clicked empty space — cancel link
      onEditorStateChange({ mode: 'select', pendingLinkSrc: null });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const screen = getScreenCoords(e);

    // Pan (middle button or space+drag)
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
    const H = canvas.height;
    const es = esRef.current;

    // Rubber-band preview: store mouse in content coords
    if (es.mode === 'edge') {
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

    prevMouseRef.current = screen;
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 1 || panRef.current) {
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
    if (esRef.current.mode === 'edge') {
      onEditorStateChange({ mousePos: null });
    }
    if (panRef.current && !spaceRef.current) {
      panRef.current = null;
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
  // Edge editor
  // ---------------------------------------------------------------------------

  const handleEdgeTypeChange = (type: EdgeType) => {
    if (!edgeEditor) return;
    dispatch({ type: 'UPDATE_EDGE', payload: { id: edgeEditor.edgeId, type } });
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

  return (
    <div ref={containerRef} style={styles.container} onMouseLeave={handleMouseLeave}>
      {!hasImage && (
        <div style={styles.placeholder}>
          <span>Upload a map image to begin</span>
        </div>
      )}

      <canvas
        ref={canvasRef}
        style={{ display: 'block' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDblClick}
        // Prevent context menu on middle click
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Label editor popup */}
      {labelEditor && (
        <div
          style={{
            ...styles.popup,
            left: Math.min(labelEditor.screenX + 12, canvasW - 220),
            top: labelEditor.screenY + 16,
          }}
        >
          <div style={styles.popupRow}>
            <label style={styles.popupLabel}>Label</label>
            <input
              style={styles.popupInput}
              autoFocus
              value={labelEditor.label}
              onChange={(ev) => setLabelEditor({ ...labelEditor, label: ev.target.value })}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') submitLabelEditor();
                if (ev.key === 'Escape') setLabelEditor(null);
              }}
            />
          </div>
          <div style={styles.popupRow}>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={labelEditor.isRoom}
                onChange={(ev) => setLabelEditor({ ...labelEditor, isRoom: ev.target.checked })}
              />
              <span>Is room</span>
            </label>
          </div>
          {labelEditor.isRoom && (
            <div style={styles.popupRow}>
              <label style={styles.popupLabel}>Category</label>
              <input
                style={styles.popupInput}
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
          <div style={styles.popupRow}>
            <label style={styles.checkLabel}>
              <input
                type="checkbox"
                checked={labelEditor.isConnector}
                onChange={(ev) => setLabelEditor({ ...labelEditor, isConnector: ev.target.checked })}
              />
              <span>Is connector</span>
            </label>
          </div>
          <div style={{ ...styles.popupRow, justifyContent: 'flex-end', gap: 6 }}>
            <button style={styles.popupBtn} onClick={() => setLabelEditor(null)}>Cancel</button>
            <button style={{ ...styles.popupBtn, ...styles.popupBtnPrimary }} onClick={submitLabelEditor}>
              Save
            </button>
          </div>
        </div>
      )}

      {/* Edge editor popup */}
      {edgeEditor && (
        <div
          style={{
            ...styles.popup,
            left: Math.min(edgeEditor.screenX + 8, canvasW - 200),
            top: edgeEditor.screenY + 8,
          }}
        >
          <div style={{ ...styles.popupRow, flexWrap: 'wrap', gap: 4 }}>
            {ALL_EDGE_TYPES.map((t) => {
              const currentEdge = building.edges.find((e) => e.id === edgeEditor.edgeId);
              const isActive = currentEdge?.type === t;
              return (
                <button
                  key={t}
                  style={{
                    ...styles.edgeTypeBtn,
                    borderColor: EDGE_COLORS[t],
                    color: isActive ? '#fff' : EDGE_COLORS[t],
                    background: isActive ? EDGE_COLORS[t] : 'transparent',
                  }}
                  onClick={() => handleEdgeTypeChange(t)}
                >
                  {EDGE_LABELS[t]}
                </button>
              );
            })}
          </div>
          <div style={{ ...styles.popupRow, justifyContent: 'flex-end' }}>
            <button style={{ ...styles.popupBtn, ...styles.popupBtnDanger }} onClick={handleDeleteEdge}>
              Delete Edge
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles: Record<string, React.CSSProperties> = {
  container: {
    position: 'relative',
    width: '100%',
  },
  placeholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#555',
    fontSize: 18,
    pointerEvents: 'none',
    zIndex: 1,
  },
  popup: {
    position: 'absolute',
    background: '#1e1e1e',
    border: '1px solid #444',
    borderRadius: 6,
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    zIndex: 10,
    minWidth: 190,
    boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
  },
  popupRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  popupLabel: {
    fontSize: 12,
    color: '#aaa',
    width: 40,
    flexShrink: 0,
  },
  popupInput: {
    flex: 1,
    background: '#111',
    border: '1px solid #444',
    borderRadius: 3,
    color: '#eee',
    padding: '3px 6px',
    fontSize: 13,
    outline: 'none',
  },
  checkLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 13,
    color: '#ccc',
    cursor: 'pointer',
  },
  popupBtn: {
    padding: '3px 10px',
    borderRadius: 3,
    border: '1px solid #444',
    background: 'transparent',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 12,
  },
  popupBtnPrimary: {
    borderColor: '#378ADD',
    color: '#378ADD',
  },
  popupBtnDanger: {
    borderColor: '#D85A30',
    color: '#D85A30',
  },
  edgeTypeBtn: {
    padding: '3px 8px',
    borderRadius: 10,
    border: '1px solid',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
};
