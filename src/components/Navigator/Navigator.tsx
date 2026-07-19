import { useState, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import clsx from 'clsx';
import type { Building } from '../../types/graph';
import styles from './Navigator.module.css';
import { usePathfinder } from '../../hooks/usePathfinder';
import { useZoomPan, DEFAULT_ZOOM_PAN } from '../../hooks/useZoomPan';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { NavigatorControls } from './NavigatorControls';
import { NavigatorCanvas } from './NavigatorCanvas';

type PickMode = 'src' | 'tgt' | null;

interface NavigatorProps {
  state: Building;
}

export function Navigator({ state }: NavigatorProps) {
  const [srcId, setSrcId] = useState<string | null>(null);
  const [tgtId, setTgtId] = useState<string | null>(null);
  const [tgtCategory, setTgtCategory] = useState<string | null>(null);
  const [excludedTypes, setExcludedTypes] = useState<Set<string>>(new Set());
  const [showDirections, setShowDirections] = useState(false);
  const [pickMode, setPickMode] = useState<PickMode>(null);
  const [preferredSectionId, setPreferredSectionId] = useState<string | null>(null);
  const activeSectionId = preferredSectionId ?? state.sections[0]?.id ?? null;
  const { zoomPan, handleWheel, pan, zoomAt, setView } = useZoomPan();

  // Per-section zoom for navigator (same pattern as editor)
  const zoomPerSection = useRef<Record<string, ZoomPanState>>({});
  const zoomPanRef = useRef(zoomPan);
  // Keep a ref for activeSectionId so switchSection can read it without becoming a new function every render
  const activeSectionIdRef = useRef(activeSectionId);
  useLayoutEffect(() => {
    zoomPanRef.current = zoomPan;
    activeSectionIdRef.current = activeSectionId;
  });

  // Hoist switchSection before the effect that uses it; read activeSectionId via ref so
  // this callback stays stable and doesn't cause the srcId effect to re-fire on section changes
  const switchSection = useCallback((newId: string) => {
    if (activeSectionIdRef.current) {
      zoomPerSection.current[activeSectionIdRef.current] = zoomPanRef.current;
    }
    setPreferredSectionId(newId);
    setView(zoomPerSection.current[newId] ?? DEFAULT_ZOOM_PAN);
  }, [setView]);

  const { path, error } = usePathfinder(state, srcId, tgtId, tgtCategory, excludedTypes);

  // Wrap setSrcId so that picking a new origin also switches the canvas to that section
  const handleSrcChange = useCallback((id: string | null) => {
    setSrcId(id);
    if (id) {
      const srcNode = state.nodes.find((n) => n.id === id);
      if (srcNode) switchSection(srcNode.sectionId);
    }
  }, [state.nodes, switchSection]);

  const handleTgtChange = useCallback((id: string | null) => {
    setTgtId(id);
    setTgtCategory(null);
  }, []);

  const handleTgtCategoryChange = useCallback((cat: string | null) => {
    setTgtCategory(cat);
    setTgtId(null);
  }, []);

  const handleNodePick = useCallback((nodeId: string) => {
    if (pickMode === 'src') handleSrcChange(nodeId);
    else if (pickMode === 'tgt') handleTgtChange(nodeId);
    setPickMode(null);
  }, [pickMode, handleSrcChange, handleTgtChange]);

  // When routing by category, resolve the destination room name from the path's last node
  const resolvedTgtLabel = useMemo(() => {
    if (!tgtCategory || !path || path.length === 0) return null;
    const nodeIndex = new Map(state.nodes.map((n) => [n.id, n]));
    const tgtNode = nodeIndex.get(path[path.length - 1]);
    if (!tgtNode) return null;
    const sectionName = state.sections.find((s) => s.id === tgtNode.sectionId)?.name ?? '';
    return tgtNode.label ? `${tgtNode.label} (${sectionName})` : `(unlabeled) (${sectionName})`;
  }, [tgtCategory, path, state.nodes, state.sections]);

  // Ordered list of sections that the path visits (deduplicated, in order)
  const pathSections = useMemo(() => {
    if (!path) return [];
    const nodeIndex = new Map(state.nodes.map((n) => [n.id, n]));
    const sections: string[] = [];
    for (const nodeId of path) {
      const node = nodeIndex.get(nodeId);
      if (node && (sections.length === 0 || sections[sections.length - 1] !== node.sectionId)) {
        sections.push(node.sectionId);
      }
    }
    return sections;
  }, [path, state.nodes]);

  const currentPathSectionIndex = pathSections.lastIndexOf(activeSectionId ?? '');
  const canStepPrev = currentPathSectionIndex > 0;
  const canStepNext = currentPathSectionIndex < pathSections.length - 1 && currentPathSectionIndex !== -1;

  return (
    <div className={styles.navigator}>
      {/* Multi-section step indicator spans full width above body */}
      {pathSections.length > 1 && (
        <div className={styles.stepBar}>
          <button
            className={clsx(styles.stepBtn, !canStepPrev && styles.stepBtnDisabled)}
            disabled={!canStepPrev}
            onClick={() => switchSection(pathSections[currentPathSectionIndex - 1])}
          >
            ← Prev
          </button>
          <span className={styles.stepLabel}>
            {state.sections.find((s) => s.id === activeSectionId)?.name ?? '—'}
            {' '}
            <span className={styles.stepCount}>
              ({currentPathSectionIndex === -1 ? '?' : currentPathSectionIndex + 1}/{pathSections.length})
            </span>
          </span>
          <button
            className={clsx(styles.stepBtn, !canStepNext && styles.stepBtnDisabled)}
            disabled={!canStepNext}
            onClick={() => switchSection(pathSections[currentPathSectionIndex + 1])}
          >
            Next →
          </button>
        </div>
      )}

      <div className={styles.body}>
        <NavigatorControls
          building={state}
          srcId={srcId}
          tgtId={tgtId}
          tgtCategory={tgtCategory}
          excludedTypes={excludedTypes}
          showDirections={showDirections}
          path={path}
          error={error}
          resolvedTgtLabel={resolvedTgtLabel}
          pickMode={pickMode}
          onSrcChange={handleSrcChange}
          onTgtChange={handleTgtChange}
          onTgtCategoryChange={handleTgtCategoryChange}
          activeSectionId={activeSectionId}
          onSectionChange={switchSection}
          onExcludedTypesChange={setExcludedTypes}
          onDirectionsToggle={setShowDirections}
          onPickModeChange={setPickMode}
        />

        <div className={styles.canvasArea}>
          <NavigatorCanvas
            building={state}
            activeSectionId={activeSectionId}
            path={path}
            zoomPan={zoomPan}
            onWheel={handleWheel}
            onPan={pan}
            onZoomAt={zoomAt}
            pickMode={pickMode}
            onNodePick={handleNodePick}
            onPickCancel={() => setPickMode(null)}
            onSetOrigin={handleSrcChange}
            onSetDestination={handleTgtChange}
          />
        </div>
      </div>
    </div>
  );
}

