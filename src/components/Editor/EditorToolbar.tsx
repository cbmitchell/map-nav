import { useRef } from 'react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import type { Dispatch } from 'react';
import type { Building, Section } from '../../types/graph';
import type { EditorState, EditorMode } from '../../types/editor';
import type { Action } from '../../hooks/useGraphReducer';
import { exportBuilding, importBuilding } from '../../utils/export';
import { useMobile } from '../../hooks/useMobile';
import styles from './EditorToolbar.module.css';

interface EditorToolbarProps {
  building: Building;
  activeSection: Section | undefined;
  editorState: EditorState;
  onEditorStateChange: (update: Partial<EditorState>) => void;
  onDelete: () => void;
  dispatch: Dispatch<Action>;
  scale: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
  onSidebarToggle: () => void;
}

export function EditorToolbar({
  building,
  activeSection,
  editorState,
  onEditorStateChange,
  onDelete,
  dispatch,
  scale,
  onZoomIn,
  onZoomOut,
  onResetView,
  onSidebarToggle,
}: EditorToolbarProps) {
  const importInputRef = useRef<HTMLInputElement>(null);
  const { isMobile, isTablet } = useMobile();
  const isMobileOrTablet = isMobile || isTablet;

  const setMode = (mode: EditorMode) => {
    onEditorStateChange({
      mode,
      pendingEdgeSrcId: null,
      selectedNodeId: null,
      selectedEdgeId: null,
      calibrateA: null,
      calibrateB: null,
      lastPathNodeId: null,
    });
  };

  const handleAutoConnectToggle = (checked: boolean) => {
    onEditorStateChange(
      checked
        ? { autoConnectEnabled: true }
        : { autoConnectEnabled: false, snapToAxis: false, lastPathNodeId: null },
    );
  };

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
      {/* Hamburger — hidden on desktop via CSS, shown on tablet/mobile */}
      <button className={styles.hamburger} onClick={onSidebarToggle} title="Toggle sections">☰</button>

      {/* Current section name */}
      {activeSection && (
        <span className={styles.sectionName}>{activeSection.name}</span>
      )}

      {/* Mode buttons */}
      <div className={styles.group}>
        {([
          ['select', 'Select', (
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <path d="M1.5 1.5 L1.5 10.5 L4.5 7.5 L6.5 12.5 L8 11.8 L6 6.8 L10 6.8 Z" />
            </svg>
          )],
          ['node', 'Add Node', '⊕'],
          ['edge', 'Add Edge', '↔'],
        ] as [EditorMode, string, ReactNode][]).map(([m, label, icon]) => (
          <button
            key={m}
            title={label}
            className={clsx(styles.btn, editorState.mode === m && styles.btnActive)}
            onClick={() => setMode(m)}
          >
            <span className={styles.btnLabel}>{label}</span>
            <span className={styles.btnIcon}>{icon}</span>
          </button>
        ))}
        <button
          title={
            activeSection
              ? activeSection.scale !== undefined
                ? `Calibrate (calibrated — ${activeSection.scale.toExponential(2)} units/px)`
                : 'Calibrate (not calibrated)'
              : 'Calibrate'
          }
          className={clsx(styles.btn, editorState.mode === 'calibrate' && styles.btnActive)}
          onClick={() => setMode('calibrate')}
        >
          <span className={styles.btnLabel}>Calibrate</span>
          <span className={styles.btnIcon}>⌖</span>
          {activeSection && (
            <span className={styles.calibrateStatusIcon}>
              {activeSection.scale !== undefined ? (
                <svg
                  width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#1D9E75"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <path d="M2.5 7.5 L5.5 10.5 L11.5 3" />
                </svg>
              ) : (
                <svg
                  width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--accent-red)"
                  strokeWidth="1.3" strokeLinejoin="round" aria-hidden
                >
                  <path d="M7 1.5 L13 12.5 L1 12.5 Z" />
                  <line x1="7" y1="5" x2="7" y2="8.5" strokeLinecap="round" />
                  <circle cx="7" cy="10.5" r="0.75" fill="var(--accent-red)" stroke="none" />
                </svg>
              )}
            </span>
          )}
        </button>
        <button
          title="Adjust Image"
          disabled={!activeSection?.imageData}
          className={clsx(
            styles.btn,
            editorState.mode === 'adjust-image' && styles.btnActive,
            !activeSection?.imageData && styles.btnDisabled,
          )}
          onClick={() => setMode('adjust-image')}
        >
          <span className={styles.btnLabel}>Adjust Image</span>
          <span className={styles.btnIcon}>⤢</span>
        </button>
      </div>

      {/* Node-path toggles — desktop only */}
      {editorState.mode === 'node' && !isMobileOrTablet && (
        <div className={styles.group}>
          <label className={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={editorState.autoConnectEnabled}
              onChange={(e) => handleAutoConnectToggle(e.target.checked)}
            />
            Automatically create edges
          </label>
          <label className={clsx(styles.toggleLabel, !editorState.autoConnectEnabled && styles.toggleLabelDisabled)}>
            <input
              type="checkbox"
              checked={editorState.snapToAxis}
              disabled={!editorState.autoConnectEnabled}
              onChange={(e) => onEditorStateChange({ snapToAxis: e.target.checked })}
            />
            Snap to axis
          </label>
        </div>
      )}

      <div className={styles.divider} />

      {/* Action buttons */}
      <div className={styles.group}>
        {isMobileOrTablet && (
          <button
            title="Delete selected"
            className={clsx(styles.btn, hasSelection ? styles.btnDanger : styles.btnDisabled)}
            disabled={!hasSelection}
            onClick={onDelete}
          >
            <span className={styles.btnLabel}>Delete</span>
            <span className={styles.btnIcon}>✕</span>
          </button>
        )}
        <button title="Import" className={styles.btn} onClick={handleImportClick}>
          <span className={styles.btnLabel}>Import</span>
          <span className={styles.btnIcon}>
            {/* Arrow pointing down into a tray */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <rect x="6" y="1" width="2" height="6"/>
              <polygon points="3.5,6 10.5,6 7,10.5"/>
              <rect x="1" y="12" width="12" height="1.5" rx="0.5"/>
            </svg>
          </span>
        </button>
        <button
          title="Export"
          className={clsx(styles.btn, building.sections.length === 0 && styles.btnDisabled)}
          disabled={building.sections.length === 0}
          onClick={() => exportBuilding(building)}
        >
          <span className={styles.btnLabel}>Export</span>
          <span className={styles.btnIcon}>
            {/* Arrow pointing up out of a tray */}
            <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor" aria-hidden>
              <polygon points="3.5,7.5 10.5,7.5 7,3"/>
              <rect x="6" y="7" width="2" height="4"/>
              <rect x="1" y="12" width="12" height="1.5" rx="0.5"/>
            </svg>
          </span>
        </button>
      </div>

      <div className={styles.divider} />

      {/* Zoom controls */}
      <div className={styles.group}>
        <button className={styles.btn} onClick={onZoomOut} title="Zoom out">−</button>
        <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
        <button className={styles.btn} onClick={onZoomIn} title="Zoom in">+</button>
        <button className={styles.btn} onClick={onResetView} title="Reset view">
          <span className={styles.btnLabel}>Reset</span>
          <span className={styles.btnIcon}>↺</span>
        </button>
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
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={handleImportChange}
      />
    </div>
  );
}

