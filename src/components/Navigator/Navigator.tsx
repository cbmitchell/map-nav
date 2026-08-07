import { useState, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import clsx from 'clsx';
import type { Building } from '../../types/graph';
import styles from './Navigator.module.css';
import { usePathfinder } from '../../hooks/usePathfinder';
import { findMarkerForEntrance } from '../../utils/roomEntrances';
import { useZoomPan, DEFAULT_ZOOM_PAN } from '../../hooks/useZoomPan';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { NavigatorControls } from './NavigatorControls';
import { NavigatorCanvas } from './NavigatorCanvas';

interface NavigatorProps {
  state: Building;
  hiddenCategories: string[];
  onHiddenCategoriesChange: (next: string[]) => void;
  favorites: string[];
  onFavoritesChange: (next: string[]) => void;
}

export function Navigator({ state, hiddenCategories, onHiddenCategoriesChange, favorites, onFavoritesChange }: NavigatorProps) {
  const hiddenCategoriesSet = useMemo(() => new Set(hiddenCategories), [hiddenCategories]);
  const favoritesSet = useMemo(() => new Set(favorites), [favorites]);
  const [srcId, setSrcId] = useState<string | null>(null);
  const [tgtId, setTgtId] = useState<string | null>(null);
  const [tgtCategory, setTgtCategory] = useState<string | null>(null);
  const [excludedTypes, setExcludedTypes] = useState<Set<string>>(new Set());
  const [showDirections, setShowDirections] = useState(false);
  const [preferredSectionId, setPreferredSectionId] = useState<string | null>(null);
  const activeSectionId = preferredSectionId ?? state.sections[0]?.id ?? null;
  // Tracks which occurrence of a (possibly repeated) path section is currently being
  // viewed. Set explicitly by switchSection's optional stepIndex arg when Prev/Next
  // trigger the switch; null for any other switch (origin pick, sidebar tab click), in
  // which case currentPathSectionIndex below falls back to the first occurrence.
  const [pathStepIndex, setPathStepIndex] = useState<number | null>(null);
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
  const switchSection = useCallback((newId: string, stepIndex?: number) => {
    if (activeSectionIdRef.current) {
      zoomPerSection.current[activeSectionIdRef.current] = zoomPanRef.current;
    }
    setPreferredSectionId(newId);
    setPathStepIndex(stepIndex ?? null);
    setView(zoomPerSection.current[newId] ?? DEFAULT_ZOOM_PAN);
  }, [setView]);

  const { path, error } = usePathfinder(state, srcId, tgtId, tgtCategory, excludedTypes);

  // A stale step index from a previous route must never leak into a new one.
  // usePathfinder memoizes path, so this only fires on a genuine recompute. Adjusting
  // state during render in response to a value change, rather than in a useEffect,
  // matches this codebase's existing idiom — see NavigatorCanvas.tsx's
  // prevSectionId/nodeMenu reset and Editor.tsx's preferredSectionId-deleted reset.
  const [prevPath, setPrevPath] = useState(path);
  if (path !== prevPath) {
    setPrevPath(path);
    setPathStepIndex(null);
  }

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

  const handleToggleFavorite = useCallback((nodeId: string) => {
    onFavoritesChange(
      favorites.includes(nodeId) ? favorites.filter((id) => id !== nodeId) : [...favorites, nodeId],
    );
  }, [favorites, onFavoritesChange]);

  // When the path's origin/destination is a room marker's entrance, the entrance
  // visually impersonates the room in the canvas — the Directions panel should show
  // the marker's own label at Start/Arrive too, not the entrance's (usually blank) one.
  // A lone room (no marker) has no Room Entrance edge, so this naturally resolves to
  // null and falls back to the node's own real label.
  const originLabel = useMemo(() => {
    if (!path || path.length === 0) return null;
    return findMarkerForEntrance(state.nodes, state.edges, path[0])?.label ?? null;
  }, [path, state.nodes, state.edges]);
  const destinationLabel = useMemo(() => {
    if (!path || path.length === 0) return null;
    return findMarkerForEntrance(state.nodes, state.edges, path[path.length - 1])?.label ?? null;
  }, [path, state.nodes, state.edges]);

  // When routing by category, resolve the destination room name from the path's last node
  const resolvedTgtLabel = useMemo(() => {
    if (!tgtCategory || !path || path.length === 0) return null;
    const nodeIndex = new Map(state.nodes.map((n) => [n.id, n]));
    const tgtNode = nodeIndex.get(path[path.length - 1]);
    if (!tgtNode) return null;
    const sectionName = state.sections.find((s) => s.id === tgtNode.sectionId)?.name ?? '';
    return tgtNode.label ? `${tgtNode.label} (${sectionName})` : `(unlabeled) (${sectionName})`;
  }, [tgtCategory, path, state.nodes, state.sections]);

  // Ordered list of (section, node-ids) runs the path visits — merges only consecutive
  // same-section nodes, so a floor revisited non-consecutively produces a separate run
  // each time (e.g. F1, F2, F3, F2, F1, B). Also used to scope the auto-fit zoom (see
  // currentStepNodeIds below) to just the nodes relevant to the step being viewed, not
  // every node the path ever touches in that section across all its visits.
  const pathSectionRanges = useMemo(() => {
    if (!path) return [];
    const nodeIndex = new Map(state.nodes.map((n) => [n.id, n]));
    const ranges: { sectionId: string; nodeIds: string[] }[] = [];
    for (const nodeId of path) {
      const node = nodeIndex.get(nodeId);
      if (!node) continue;
      const last = ranges[ranges.length - 1];
      if (last && last.sectionId === node.sectionId) {
        last.nodeIds.push(nodeId);
      } else {
        ranges.push({ sectionId: node.sectionId, nodeIds: [nodeId] });
      }
    }
    return ranges;
  }, [path, state.nodes]);

  const pathSections = useMemo(() => pathSectionRanges.map((r) => r.sectionId), [pathSectionRanges]);

  // Trust the explicit step index only if it still points at the currently active
  // section (defensive guard); otherwise fall back to the first occurrence, a
  // deterministic default for any section switch that isn't Prev/Next-driven.
  const currentPathSectionIndex =
    pathStepIndex !== null && pathSections[pathStepIndex] === activeSectionId
      ? pathStepIndex
      : pathSections.indexOf(activeSectionId ?? '');
  const canStepPrev = currentPathSectionIndex > 0;
  const canStepNext = currentPathSectionIndex < pathSections.length - 1 && currentPathSectionIndex !== -1;

  // The specific run of path nodes belonging to the step currently being viewed — passed
  // to NavigatorCanvas so its auto-fit zoom frames just this step, not every node the
  // path touches in this section across all the times it's visited.
  const currentStepNodeIds = pathSectionRanges[currentPathSectionIndex]?.nodeIds ?? null;

  return (
    <div className={styles.navigator}>
      {/* Multi-section step indicator spans full width above body */}
      {pathSections.length > 1 && (
        <div className={styles.stepBar}>
          <button
            className={clsx(styles.stepBtn, !canStepPrev && styles.stepBtnDisabled)}
            disabled={!canStepPrev}
            onClick={() => switchSection(pathSections[currentPathSectionIndex - 1], currentPathSectionIndex - 1)}
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
            onClick={() => switchSection(pathSections[currentPathSectionIndex + 1], currentPathSectionIndex + 1)}
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
          originLabel={originLabel}
          destinationLabel={destinationLabel}
          onSrcChange={handleSrcChange}
          onTgtChange={handleTgtChange}
          onTgtCategoryChange={handleTgtCategoryChange}
          activeSectionId={activeSectionId}
          onSectionChange={switchSection}
          onExcludedTypesChange={setExcludedTypes}
          onDirectionsToggle={setShowDirections}
          hiddenCategories={hiddenCategories}
          onHiddenCategoriesChange={onHiddenCategoriesChange}
          favorites={favorites}
        />

        <div className={styles.canvasArea}>
          <NavigatorCanvas
            building={state}
            activeSectionId={activeSectionId}
            path={path}
            currentStepNodeIds={currentStepNodeIds}
            zoomPan={zoomPan}
            onWheel={handleWheel}
            onPan={pan}
            onZoomAt={zoomAt}
            onAutoFit={setView}
            onSetOrigin={handleSrcChange}
            onSetDestination={handleTgtChange}
            hiddenCategories={hiddenCategoriesSet}
            favorites={favoritesSet}
            onToggleFavorite={handleToggleFavorite}
          />
        </div>
      </div>
    </div>
  );
}

