import { useRef } from 'react';
import { renderPdfPage } from '../../utils/pdf';
import type { Dispatch } from 'react';
import type { Building, Section } from '../../types/graph';
import type { EdgeType } from '../../types/graph';
import type { EditorState, EditorMode } from '../../types/editor';
import type { Action } from '../../hooks/useGraphReducer';
import { EDGE_COLORS, EDGE_LABELS } from '../../hooks/useCanvasRenderer';
import { FIXED_WEIGHTS } from '../../utils/pathfinding';
import { exportBuilding, importBuilding } from '../../utils/export';

const ALL_EDGE_TYPES: EdgeType[] = ['walkway', 'stairs', 'elevator', 'ramp', 'bridge'];

interface EditorToolbarProps {
  building: Building;
  activeSectionId: string | null;
  activeSection: Section | undefined;
  editorState: EditorState;
  onEditorStateChange: (update: Partial<EditorState>) => void;
  onDelete: () => void;
  dispatch: Dispatch<Action>;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export function EditorToolbar({
  building,
  activeSectionId,
  activeSection,
  editorState,
  onEditorStateChange,
  onDelete,
  dispatch,
  scale,
  onZoomIn,
  onZoomOut,
  onResetView,
}: EditorToolbarProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const setMode = (mode: EditorMode) => {
    onEditorStateChange({ mode, pendingEdgeSrcId: null, selectedNodeId: null, selectedEdgeId: null });
  };

  const handleUploadClick = () => fileInputRef.current?.click();

  const dispatchImage = (imageData: string, imageW: number, imageH: number) => {
    if (!activeSectionId) return;
    dispatch({ type: 'UPDATE_SECTION_IMAGE', payload: { id: activeSectionId, imageData, imageW, imageH } });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.type === 'application/pdf') {
      const { imageData, imageW, imageH } = await renderPdfPage(file, 1);
      dispatchImage(imageData, imageW, imageH);
    } else {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const imageData = ev.target?.result as string;
        const img = new Image();
        img.onload = () => dispatchImage(imageData, img.naturalWidth, img.naturalHeight);
        img.src = imageData;
      };
      reader.readAsDataURL(file);
    }
  };

  const fixedWeight = FIXED_WEIGHTS[editorState.currentEdgeType];
  const weightHint = fixedWeight !== undefined ? `Fixed: ${fixedWeight}` : 'Euclidean';

  const handleImportClick = () => importInputRef.current?.click();

  const handleImportChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    if (building.nodes.length > 0 || building.sections.length > 0) {
      const ok = window.confirm('Import will replace your current building data. Continue?');
      if (!ok) return;
    }
    try {
      const imported = await importBuilding(file);
      dispatch({ type: 'LOAD_BUILDING', payload: imported });
    } catch {
      window.alert('Failed to import: the file may be invalid or corrupted.');
    }
  };

  const hasSelection = editorState.selectedNodeId !== null || editorState.selectedEdgeId !== null;

  return (
    <div style={styles.toolbar}>
      {/* Current section name */}
      {activeSection && (
        <span style={styles.sectionName}>{activeSection.name}</span>
      )}

      {/* Mode buttons */}
      <div style={styles.group}>
        {(['select', 'node', 'edge'] as EditorMode[]).map((m) => (
          <button
            key={m}
            style={{ ...styles.btn, ...(editorState.mode === m ? styles.btnActive : {}) }}
            onClick={() => setMode(m)}
          >
            {m === 'select' ? 'Select' : m === 'node' ? 'Add Node' : 'Add Edge'}
          </button>
        ))}
      </div>

      <div style={styles.divider} />

      {/* Edge type selector */}
      <div style={styles.group}>
        {ALL_EDGE_TYPES.map((t) => (
          <button
            key={t}
            style={{
              ...styles.edgeTypeBtn,
              borderColor: EDGE_COLORS[t],
              color: editorState.currentEdgeType === t ? '#fff' : EDGE_COLORS[t],
              background: editorState.currentEdgeType === t ? EDGE_COLORS[t] : 'transparent',
            }}
            onClick={() => onEditorStateChange({ currentEdgeType: t })}
          >
            {EDGE_LABELS[t]}
          </button>
        ))}
        <span style={styles.weightHint}>{weightHint}</span>
      </div>

      <div style={styles.divider} />

      {/* Action buttons */}
      <div style={styles.group}>
        <button
          style={{ ...styles.btn, ...(hasSelection ? styles.btnDanger : styles.btnDisabled) }}
          disabled={!hasSelection}
          onClick={onDelete}
        >
          Delete
        </button>
        <button
          style={{ ...styles.btn, ...(!activeSectionId ? styles.btnDisabled : {}) }}
          disabled={!activeSectionId}
          onClick={handleUploadClick}
        >
          Replace Image
        </button>
        <button style={styles.btn} onClick={handleImportClick}>
          Import JSON
        </button>
        <button
          style={{ ...styles.btn, ...(building.sections.length === 0 ? styles.btnDisabled : {}) }}
          disabled={building.sections.length === 0}
          onClick={() => exportBuilding(building)}
        >
          Export JSON
        </button>
      </div>

      <div style={styles.divider} />

      {/* Zoom controls */}
      <div style={styles.group}>
        <button style={styles.btn} onClick={onZoomOut} title="Zoom out">−</button>
        <span style={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
        <button style={styles.btn} onClick={onZoomIn} title="Zoom in">+</button>
        <button style={styles.btn} onClick={onResetView} title="Reset view">Reset</button>
      </div>

      {/* Pending cross-section link banner (Phase 3) */}
      {editorState.mode === 'link' && editorState.pendingLinkSrc && (
        <div style={styles.linkBanner}>
          {(() => {
            const srcNode = building.nodes.find((n) => n.id === editorState.pendingLinkSrc?.nodeId);
            const srcSection = building.sections.find((s) => s.id === editorState.pendingLinkSrc?.sectionId);
            return `Linking from "${srcNode?.label || 'node'}" on ${srcSection?.name || 'section'} — switch to target section and click a connector node.`;
          })()}
          <button
            style={styles.cancelBtn}
            onClick={() => onEditorStateChange({ mode: 'select', pendingLinkSrc: null })}
          >
            Cancel
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportChange}
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    padding: '6px 12px',
    background: '#111',
    borderBottom: '1px solid #333',
    flexShrink: 0,
    minHeight: 44,
  },
  group: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  divider: {
    width: 1,
    height: 24,
    background: '#333',
    margin: '0 4px',
  },
  btn: {
    padding: '4px 12px',
    borderRadius: 4,
    border: '1px solid #444',
    background: 'transparent',
    color: '#ccc',
    cursor: 'pointer',
    fontSize: 13,
    whiteSpace: 'nowrap' as const,
  },
  btnActive: {
    background: '#2a2a2a',
    color: '#fff',
    borderColor: '#888',
  },
  btnDanger: {
    borderColor: '#D85A30',
    color: '#D85A30',
  },
  btnDisabled: {
    opacity: 0.4,
    cursor: 'not-allowed',
  },
  edgeTypeBtn: {
    padding: '3px 10px',
    borderRadius: 12,
    border: '1px solid',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 500,
  },
  weightHint: {
    fontSize: 11,
    color: '#666',
    marginLeft: 4,
  },
  zoomLabel: {
    fontSize: 12,
    color: '#888',
    minWidth: 38,
    textAlign: 'center' as const,
  },
  sectionName: {
    fontSize: 12,
    color: '#666',
    paddingRight: 4,
    whiteSpace: 'nowrap' as const,
    maxWidth: 160,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  linkBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 10px',
    background: '#1a1a2e',
    border: '1px solid #534AB7',
    borderRadius: 4,
    fontSize: 12,
    color: '#a89fef',
    marginLeft: 'auto',
  },
  cancelBtn: {
    padding: '2px 8px',
    borderRadius: 3,
    border: '1px solid #534AB7',
    background: 'transparent',
    color: '#a89fef',
    cursor: 'pointer',
    fontSize: 12,
  },
};
