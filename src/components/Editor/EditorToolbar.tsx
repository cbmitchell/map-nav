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
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="m320-410 79-110h170L320-716v306ZM551-80 406-392 240-160v-720l560 440H516l144 309-109 51ZM399-520Z"/>
            </svg>
          )],
          ['node', 'Add Node', (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M440-400h80v-120h120v-80H520v-120h-80v120H320v80h120v120Zm40 214q122-112 181-203.5T720-552q0-109-69.5-178.5T480-800q-101 0-170.5 69.5T240-552q0 71 59 162.5T480-186Zm0 106Q319-217 239.5-334.5T160-552q0-150 96.5-239T480-880q127 0 223.5 89T800-552q0 100-79.5 217.5T480-80Zm0-480Z"/>
            </svg>
          )],
          ['edge', 'Add Edge', (
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M760-80q-50 0-85-35t-35-85q0-14 3-27t9-25L252-652q-12 6-25 9t-27 3q-50 0-85-35t-35-85q0-50 35-85t85-35q50 0 85 35t35 85q0 14-3 27t-9 25l400 400q12-6 25-9t27-3q50 0 85 35t35 85q0 50-35 85t-85 35Z"/>
            </svg>
          )],
          ...(isMobileOrTablet ? [['pan', 'Pan', (
            <svg width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M480-80 310-250l57-57 73 73v-206H235l73 72-58 58L80-480l169-169 57 57-72 72h206v-206l-73 73-57-57 170-170 170 170-57 57-73-73v206h205l-73-72 58-58 170 170-170 170-57-57 73-73H520v205l72-73 58 58L480-80Z" />
            </svg>
          )] as [EditorMode, string, ReactNode]] : []),
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
          <span className={styles.btnIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M200-160v-340q0-142 99-241t241-99q142 0 241 99t99 241q0 142-99 241t-241 99H200Zm80-80h260q108 0 184-76t76-184q0-108-76-184t-184-76q-108 0-184 76t-76 184v260Zm359-161q41-41 41-99t-41-99q-41-41-99-41t-99 41q-41 41-41 99t41 99q41 41 99 41t99-41Zm-141.5-56.5Q480-475 480-500t17.5-42.5Q515-560 540-560t42.5 17.5Q600-525 600-500t-17.5 42.5Q565-440 540-440t-42.5-17.5ZM80-160v-200h80v200H80Zm460-340Z"/>
            </svg>
          </span>
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
          <span className={styles.btnIcon}>
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M200-120q-33 0-56.5-23.5T120-200v-160h80v160h160v80H200Zm400 0v-80h160v-160h80v160q0 33-23.5 56.5T760-120H600ZM120-600v-160q0-33 23.5-56.5T200-840h160v80H200v160h-80Zm640 0v-160H600v-80h160q33 0 56.5 23.5T840-760v160h-80Z"/>
            </svg>
          </span>
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
            <span className={styles.btnIcon}>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
                <path d="M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z"/>
              </svg>
            </span>
          </button>
        )}
        <button title="Import" className={styles.btn} onClick={handleImportClick}>
          <span className={styles.btnLabel}>Import</span>
          <span className={styles.btnIcon}>
            {/* Arrow pointing down into a tray */}
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M480-320 280-520l56-58 104 104v-326h80v326l104-104 56 58-200 200ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
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
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
              <path d="M440-320v-326L336-542l-56-58 200-200 200 200-56 58-104-104v326h-80ZM240-160q-33 0-56.5-23.5T160-240v-120h80v120h480v-120h80v120q0 33-23.5 56.5T720-160H240Z"/>
            </svg>
          </span>
        </button>
      </div>

      <div className={styles.divider} />

      {/* Zoom controls */}
      <div className={styles.group}>
        <button className={styles.btn} onClick={onZoomOut} title="Zoom out">
          <svg xmlns="http://www.w3.org/2000/svg" height="14" width="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
            <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400ZM280-540v-80h200v80H280Z"/>
          </svg>
        </button>
        <span className={styles.zoomLabel}>{Math.round(scale * 100)}%</span>
        <button className={styles.btn} onClick={onZoomIn} title="Zoom in">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 -960 960 960" fill="currentColor" aria-hidden>
            <path d="M784-120 532-372q-30 24-69 38t-83 14q-109 0-184.5-75.5T120-580q0-109 75.5-184.5T380-840q109 0 184.5 75.5T640-580q0 44-14 83t-38 69l252 252-56 56ZM380-400q75 0 127.5-52.5T560-580q0-75-52.5-127.5T380-760q-75 0-127.5 52.5T200-580q0 75 52.5 127.5T380-400Zm-40-60v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z"/>
          </svg>
        </button>
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

