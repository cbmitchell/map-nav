import { useRef } from 'react';
import clsx from 'clsx';
import { renderPdfPage } from '../../utils/pdf';
import type { Dispatch } from 'react';
import type { Building, Section } from '../../types/graph';
import type { EdgeType } from '../../types/graph';
import type { EditorState, EditorMode } from '../../types/editor';
import type { Action } from '../../hooks/useGraphReducer';
import { EDGE_COLORS, EDGE_LABELS } from '../../hooks/useCanvasRenderer';
import { FIXED_WEIGHTS } from '../../utils/pathfinding';
import { exportBuilding, importBuilding } from '../../utils/export';
import styles from './EditorToolbar.module.css';

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
        img.onerror = () => alert('Failed to load image. The file may be corrupt or unsupported.');
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
    <div className={styles.toolbar}>
      {/* Current section name */}
      {activeSection && (
        <span className={styles.sectionName}>{activeSection.name}</span>
      )}

      {/* Mode buttons */}
      <div className={styles.group}>
        {(['select', 'node', 'edge'] as EditorMode[]).map((m) => (
          <button
            key={m}
            className={clsx(styles.btn, editorState.mode === m && styles.btnActive)}
            onClick={() => setMode(m)}
          >
            {m === 'select' ? 'Select' : m === 'node' ? 'Add Node' : 'Add Edge'}
          </button>
        ))}
      </div>

      <div className={styles.divider} />

      {/* Edge type selector — colors are dynamic (EDGE_COLORS lookup), so stay inline */}
      <div className={styles.group}>
        {ALL_EDGE_TYPES.map((t) => (
          <button
            key={t}
            className={styles.edgeTypeBtn}
            style={{
              borderColor: EDGE_COLORS[t],
              color: editorState.currentEdgeType === t ? '#fff' : EDGE_COLORS[t],
              background: editorState.currentEdgeType === t ? EDGE_COLORS[t] : 'transparent',
            }}
            onClick={() => onEditorStateChange({ currentEdgeType: t })}
          >
            {EDGE_LABELS[t]}
          </button>
        ))}
        <span className={styles.weightHint}>{weightHint}</span>
      </div>

      <div className={styles.divider} />

      {/* Action buttons */}
      <div className={styles.group}>
        <button
          className={clsx(styles.btn, hasSelection ? styles.btnDanger : styles.btnDisabled)}
          disabled={!hasSelection}
          onClick={onDelete}
        >
          Delete
        </button>
        <button
          className={clsx(styles.btn, !activeSectionId && styles.btnDisabled)}
          disabled={!activeSectionId}
          onClick={handleUploadClick}
        >
          Replace Image
        </button>
        <button className={styles.btn} onClick={handleImportClick}>
          Import JSON
        </button>
        <button
          className={clsx(styles.btn, building.sections.length === 0 && styles.btnDisabled)}
          disabled={building.sections.length === 0}
          onClick={() => exportBuilding(building)}
        >
          Export JSON
        </button>
      </div>

      <div className={styles.divider} />

      {/* Zoom controls */}
      <div className={styles.group}>
        <button className={styles.btn} onClick={onZoomOut} title="Zoom out">−</button>
        <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
        <button className={styles.btn} onClick={onZoomIn} title="Zoom in">+</button>
        <button className={styles.btn} onClick={onResetView} title="Reset view">Reset</button>
      </div>

      {/* Pending cross-section link banner */}
      {editorState.mode === 'link' && editorState.pendingLinkSrc && (
        <div className={styles.linkBanner}>
          {(() => {
            const srcNode = building.nodes.find((n) => n.id === editorState.pendingLinkSrc?.nodeId);
            const srcSection = building.sections.find((s) => s.id === editorState.pendingLinkSrc?.sectionId);
            return `Linking from "${srcNode?.label || 'node'}" on ${srcSection?.name || 'section'} — switch to target section and click a connector node.`;
          })()}
          <button
            className={styles.cancelBtn}
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

