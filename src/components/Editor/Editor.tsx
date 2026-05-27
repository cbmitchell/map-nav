import { useState, useEffect, useCallback, useRef } from 'react';
import { useGraphReducer } from '../../hooks/useGraphReducer';
import { useZoomPan, DEFAULT_ZOOM_PAN } from '../../hooks/useZoomPan';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { DEFAULT_EDITOR_STATE } from '../../types/editor';
import type { EditorState, EditorMode } from '../../types/editor';
import type { EdgeType } from '../../types/graph';
import { EditorToolbar } from './EditorToolbar';
import { EditorCanvas } from './EditorCanvas';
import { EditorSidebar } from './EditorSidebar';

const EDGE_TYPE_KEYS: EdgeType[] = ['walkway', 'stairs', 'elevator', 'ramp', 'bridge'];

export function Editor() {
  const { state, dispatch, undo } = useGraphReducer();
  // preferredSectionId: explicitly chosen by user; falls back to first available section
  const [preferredSectionId, setActiveSectionId] = useState<string | null>(null);
  const activeSectionId = preferredSectionId ?? state.sections[0]?.id ?? null;
  const [editorState, setEditorState] = useState<EditorState>(DEFAULT_EDITOR_STATE);
  const { zoomPan, zoomIn, zoomOut, resetView, handleWheel, pan, setView } = useZoomPan();

  // Per-section zoom retention
  const zoomPerSection = useRef<Record<string, ZoomPanState>>({});
  const zoomPanRef = useRef(zoomPan);
  const editorStateRef = useRef(editorState);
  const dispatchRef = useRef(dispatch);
  const undoRef = useRef(undo);

  // Keep refs in sync after each render (useLayoutEffect keeps render phase pure)
  useEffect(() => { zoomPanRef.current = zoomPan; });
  useEffect(() => { editorStateRef.current = editorState; });
  useEffect(() => { dispatchRef.current = dispatch; });
  useEffect(() => { undoRef.current = undo; });

  // Keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      // Ctrl/Cmd+Z — undo
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        undoRef.current();
        return;
      }

      // Delete / Backspace — delete selected element
      if ((e.key === 'Delete' || e.key === 'Backspace') && !e.ctrlKey && !e.metaKey) {
        const es = editorStateRef.current;
        if (es.selectedNodeId) {
          dispatchRef.current({ type: 'DELETE_NODE', payload: { id: es.selectedNodeId } });
          setEditorState((prev) => ({ ...prev, selectedNodeId: null }));
        } else if (es.selectedEdgeId) {
          dispatchRef.current({ type: 'DELETE_EDGE', payload: { id: es.selectedEdgeId } });
          setEditorState((prev) => ({ ...prev, selectedEdgeId: null }));
        }
        return;
      }

      // Escape — cancel pending operations and deselect
      if (e.key === 'Escape') {
        setEditorState((prev) => ({
          ...prev,
          mode: 'select',
          pendingEdgeSrcId: null,
          pendingLinkSrc: null,
          selectedNodeId: null,
          selectedEdgeId: null,
        }));
        return;
      }

      // S / N / E — switch mode
      const modeMap: Record<string, EditorMode> = { s: 'select', n: 'node', e: 'edge' };
      const modeKey = modeMap[e.key.toLowerCase()];
      if (modeKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setEditorState((prev) => ({
          ...prev,
          mode: modeKey,
          pendingEdgeSrcId: null,
          pendingLinkSrc: null,
        }));
        return;
      }

      // 1–5 — switch edge type
      const idx = parseInt(e.key) - 1;
      if (!isNaN(idx) && idx >= 0 && idx < EDGE_TYPE_KEYS.length && !e.ctrlKey && !e.metaKey) {
        setEditorState((prev) => ({ ...prev, currentEdgeType: EDGE_TYPE_KEYS[idx] }));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []); // empty — all mutable values accessed via refs or stable setters

  const handleSectionChange = useCallback(
    (newId: string) => {
      if (activeSectionId) {
        zoomPerSection.current[activeSectionId] = zoomPanRef.current;
      }

      setEditorState((prev) => {
        if (prev.pendingEdgeSrcId) {
          const srcNode = state.nodes.find((n) => n.id === prev.pendingEdgeSrcId);
          if (srcNode?.isConnector) {
            return {
              ...prev,
              mode: 'link',
              pendingLinkSrc: { nodeId: prev.pendingEdgeSrcId, sectionId: srcNode.sectionId },
              pendingEdgeSrcId: null,
            };
          }
          return { ...prev, pendingEdgeSrcId: null };
        }
        return prev;
      });

      setActiveSectionId(newId);
      setView(zoomPerSection.current[newId] ?? DEFAULT_ZOOM_PAN);
    },
    [activeSectionId, state.nodes, setView],
  );

  const handleEditorStateChange = (update: Partial<EditorState>) => {
    setEditorState((prev) => ({ ...prev, ...update }));
  };

  const handleDelete = () => {
    if (editorState.selectedNodeId) {
      dispatch({ type: 'DELETE_NODE', payload: { id: editorState.selectedNodeId } });
      handleEditorStateChange({ selectedNodeId: null });
    } else if (editorState.selectedEdgeId) {
      dispatch({ type: 'DELETE_EDGE', payload: { id: editorState.selectedEdgeId } });
      handleEditorStateChange({ selectedEdgeId: null });
    }
  };

  const handleZoomIn = useCallback(() => zoomIn(), [zoomIn]);
  const handleZoomOut = useCallback(() => zoomOut(), [zoomOut]);

  const activeSection = state.sections.find((s) => s.id === activeSectionId);

  return (
    <div style={styles.editor}>
      <EditorToolbar
        building={state}
        activeSectionId={activeSectionId}
        activeSection={activeSection}
        editorState={editorState}
        onEditorStateChange={handleEditorStateChange}
        onDelete={handleDelete}
        dispatch={dispatch}
        scale={zoomPan.scale}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetView={resetView}
      />
      <div style={styles.body}>
        <EditorSidebar
          building={state}
          activeSectionId={activeSectionId}
          onSectionChange={handleSectionChange}
          dispatch={dispatch}
        />
        <div style={styles.canvasArea}>
          {state.sections.length === 0 ? (
            <div style={styles.onboarding}>
              <p style={styles.onboardingTitle}>Get started</p>
              <ol style={styles.onboardingList}>
                <li>Click <strong>+ New Section</strong> in the left panel and upload a floor map image</li>
                <li>Switch to <strong>Add Node</strong> mode and click the map to place nodes</li>
                <li>Switch to <strong>Add Edge</strong> mode, then click two nodes to connect them</li>
                <li>In <strong>Select</strong> mode, double-click a node to label it and mark it as a Room</li>
                <li>Switch to <strong>Navigator</strong> mode to find paths between rooms</li>
              </ol>
              <p style={styles.onboardingHint}>
                Keyboard shortcuts: <kbd>S</kbd> Select · <kbd>N</kbd> Node · <kbd>E</kbd> Edge · <kbd>Del</kbd> Delete · <kbd>Esc</kbd> Cancel · <kbd>1</kbd>–<kbd>5</kbd> Edge type · <kbd>Ctrl+Z</kbd> Undo
              </p>
            </div>
          ) : (
            <EditorCanvas
              building={state}
              activeSectionId={activeSectionId}
              editorState={editorState}
              onEditorStateChange={handleEditorStateChange}
              dispatch={dispatch}
              zoomPan={zoomPan}
              onWheel={handleWheel}
              onPan={pan}
              onZoomIn={zoomIn}
              onZoomOut={zoomOut}
            />
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  editor: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  canvasArea: {
    flex: 1,
    overflow: 'auto',
  },
  onboarding: {
    maxWidth: 520,
    margin: '60px auto',
    padding: '0 24px',
    color: '#888',
  },
  onboardingTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: '#bbb',
    marginBottom: 16,
  },
  onboardingList: {
    fontSize: 14,
    lineHeight: 2,
    paddingLeft: 20,
    color: '#777',
  },
  onboardingHint: {
    marginTop: 24,
    fontSize: 12,
    color: '#555',
    lineHeight: 1.8,
  },
};
