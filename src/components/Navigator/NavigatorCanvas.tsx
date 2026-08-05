import { useRef, useState, useLayoutEffect, useEffect, useMemo } from 'react';
import type { Building } from '../../types/graph';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { fitZoomPan, DEFAULT_ZOOM_PAN } from '../../hooks/useZoomPan';
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer';
import { useMobile } from '../../hooks/useMobile';
import styles from './NavigatorCanvas.module.css';

const HIT_RADIUS = 12;
const PATH_FIT_PADDING = 60;

interface NodeMenuState {
  nodeId: string;
  label: string;
  screenX: number;
  screenY: number;
  // Canvas width captured at click time, for clamping the menu's horizontal position.
  // Captured here rather than read from canvasRef during render (see useCanvasRenderer.ts
  // and hitTestRoomNode) so the value can't go stale relative to what's on screen.
  canvasW: number;
}

interface NavigatorCanvasProps {
  building: Building;
  activeSectionId: string | null;
  path: string[] | null;
  zoomPan: ZoomPanState;
  onWheel: (e: WheelEvent, rect: DOMRect) => void;
  onPan: (dx: number, dy: number) => void;
  onZoomAt: (screenX: number, screenY: number, newScale: number) => void;
  onAutoFit: (state: ZoomPanState) => void;
  onSetOrigin: (nodeId: string) => void;
  onSetDestination: (nodeId: string) => void;
  hiddenCategories: Set<string>;
  favorites: Set<string>;
  onToggleFavorite: (nodeId: string) => void;
}

export function NavigatorCanvas({
  building,
  activeSectionId,
  path,
  zoomPan,
  onWheel,
  onPan,
  onZoomAt,
  onAutoFit,
  onSetOrigin,
  onSetDestination,
  hiddenCategories,
  favorites,
  onToggleFavorite,
}: NavigatorCanvasProps) {
  const { isMobile, isTablet } = useMobile();
  const isSmall = isMobile || isTablet;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Content height (image-aspect-ratio height), distinct from canvas.height which on
  // mobile/tablet can be taller so zoomed content isn't clipped. Node positions are
  // drawn against this, not the raw canvas element height — see useCanvasRenderer.
  const contentHRef = useRef(0);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const hasPannedRef = useRef(false);
  const spaceRef = useRef(false);
  const touchRef = useRef<{ lastX: number; lastY: number; lastDist: number } | null>(null);
  const zoomPanRef = useRef(zoomPan);
  const buildingRef = useRef(building);
  const activeSectionIdRef = useRef(activeSectionId);
  const hiddenCategoriesRef = useRef(hiddenCategories);

  const [nodeMenu, setNodeMenu] = useState<NodeMenuState | null>(null);

  useLayoutEffect(() => {
    zoomPanRef.current = zoomPan;
    buildingRef.current = building;
    activeSectionIdRef.current = activeSectionId;
    hiddenCategoriesRef.current = hiddenCategories;
  });

  const pathNodeSet = useMemo(() => (path ? new Set(path) : null), [path]);

  // Close the click/tap node menu when the active section changes — its screen-space
  // position is meaningless after switching sections. Adjusting state during render —
  // rather than in an effect, and tracked via useState rather than a ref so it stays
  // pure — is React's recommended pattern for reacting to a prop change like this:
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [prevSectionId, setPrevSectionId] = useState(activeSectionId);
  if (prevSectionId !== activeSectionId) {
    setPrevSectionId(activeSectionId);
    if (nodeMenu !== null) setNodeMenu(null);
  }

  const { redraw } = useCanvasRenderer(
    canvasRef,
    building,
    activeSectionId,
    undefined,
    zoomPan,
    path,
    path === null,
    true,
    hiddenCategories,
    favorites,
  );

  // Canvas sizing
  useLayoutEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const updateSize = () => {
      const w = container.clientWidth;
      const section = buildingRef.current.sections.find(
        (s) => s.id === activeSectionIdRef.current,
      );
      const imageAspectH = section?.imageW ? Math.round((w * section.imageH) / section.imageW) : w;
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
  }, [activeSectionId, building.sections, redraw, isSmall, onAutoFit]);

  // Auto-fit the view to the selected path's nodes in the currently displayed section.
  // Re-runs whenever the path or the active section changes (including stepping through
  // a multi-section path), overriding whatever zoom/pan was there before.
  useLayoutEffect(() => {
    if (!path) return;
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const pathNodeSet = new Set(path);
    const pathNodesInSection = buildingRef.current.nodes.filter(
      (n) => n.sectionId === activeSectionIdRef.current && pathNodeSet.has(n.id),
    );
    if (pathNodesInSection.length === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of pathNodesInSection) {
      const x = node.nx * canvas.width;
      const y = node.ny * contentHRef.current;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }

    onAutoFit(fitZoomPan(
      { minX, minY, maxX, maxY },
      container.clientWidth,
      container.clientHeight,
      PATH_FIT_PADDING,
    ));
  }, [path, activeSectionId, onAutoFit]);

  // Wheel zoom (non-passive)
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

  // Space key pan mode + Escape to close the node menu
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        setNodeMenu(null);
        return;
      }
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
        if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Mouse interaction (pan only)
  // ---------------------------------------------------------------------------

  // Hit-test room nodes on the active section in screen space
  const hitTestRoomNode = (sx: number, sy: number): { id: string; label: string } | null => {
    const canvas = canvasRef.current!;
    const sectionNodes = buildingRef.current.nodes.filter(
      (n) => n.sectionId === activeSectionIdRef.current && n.isRoom &&
        (!n.category || !hiddenCategoriesRef.current.has(n.category) || (pathNodeSet !== null && pathNodeSet.has(n.id))),
    );

    let hit: { id: string; label: string } | null = null;
    let bestDist = Infinity;
    for (const node of sectionNodes) {
      // node normalized coords → canvas pixel coords → screen coords
      const nodeCanvasX = node.nx * canvas.width;
      const nodeCanvasY = node.ny * contentHRef.current;
      const nodeScreenX = nodeCanvasX * zoomPanRef.current.scale + zoomPanRef.current.panX;
      const nodeScreenY = nodeCanvasY * zoomPanRef.current.scale + zoomPanRef.current.panY;
      const dist = Math.hypot(sx - nodeScreenX, sy - nodeScreenY);
      if (dist < HIT_RADIUS && dist < bestDist) {
        bestDist = dist;
        hit = { id: node.id, label: node.label || '(unlabeled)' };
      }
    }
    return hit;
  };

  const handleClick = (e: React.MouseEvent) => {
    if (hasPannedRef.current || spaceRef.current) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const section = buildingRef.current.sections.find(
      (s) => s.id === activeSectionIdRef.current,
    );
    if (!section) { setNodeMenu(null); return; }

    // Clicking a room node opens a menu to set it as origin/destination
    const hit = hitTestRoomNode(sx, sy);
    setNodeMenu(hit ? { nodeId: hit.id, label: hit.label, screenX: sx, screenY: sy, canvasW: canvas.width } : null);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (nodeMenu) setNodeMenu(null);

    if (e.button === 1 || e.button === 0) {
      e.preventDefault();
      panRef.current = { lastX: sx, lastY: sy };
      hasPannedRef.current = false;
      canvas.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (!panRef.current) {
      if (!spaceRef.current) {
        canvas.style.cursor = hitTestRoomNode(sx, sy) ? 'pointer' : 'grab';
      }
      return;
    }

    const dx = sx - panRef.current.lastX;
    const dy = sy - panRef.current.lastY;
    if (dx !== 0 || dy !== 0) hasPannedRef.current = true;
    onPan(dx, dy);
    panRef.current = { lastX: sx, lastY: sy };
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 1 || e.button === 0) {
      panRef.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = 'grab';
    }
  };

  // ---------------------------------------------------------------------------
  // Touch interaction (pan + pinch-zoom)
  // ---------------------------------------------------------------------------

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      const t = e.touches[0];
      touchRef.current = { lastX: t.clientX, lastY: t.clientY, lastDist: 0 };
    } else if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      touchRef.current = {
        lastX: midX - rect.left,
        lastY: midY - rect.top,
        lastDist: dist,
      };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchRef.current) return;

    if (e.touches.length === 1) {
      const t = e.touches[0];
      onPan(t.clientX - touchRef.current.lastX, t.clientY - touchRef.current.lastY);
      touchRef.current = { ...touchRef.current, lastX: t.clientX, lastY: t.clientY };
    } else if (e.touches.length === 2) {
      const [t1, t2] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      const midX = (t1.clientX + t2.clientX) / 2;
      const midY = (t1.clientY + t2.clientY) / 2;
      const canvas = canvasRef.current!;
      const rect = canvas.getBoundingClientRect();
      const screenX = midX - rect.left;
      const screenY = midY - rect.top;

      if (touchRef.current.lastDist > 0) {
        const factor = dist / touchRef.current.lastDist;
        onZoomAt(screenX, screenY, zoomPanRef.current.scale * factor);
        onPan(screenX - touchRef.current.lastX, screenY - touchRef.current.lastY);
      }

      touchRef.current = { lastX: screenX, lastY: screenY, lastDist: dist };
    }
  };

  const handleTouchEnd = () => {
    touchRef.current = null;
  };

  // ---------------------------------------------------------------------------
  // Node context menu
  // ---------------------------------------------------------------------------

  const handleSetOrigin = () => {
    if (!nodeMenu) return;
    onSetOrigin(nodeMenu.nodeId);
    setNodeMenu(null);
  };

  const handleSetDestination = () => {
    if (!nodeMenu) return;
    onSetDestination(nodeMenu.nodeId);
    setNodeMenu(null);
  };

  const handleToggleFavorite = () => {
    if (!nodeMenu) return;
    onToggleFavorite(nodeMenu.nodeId);
    setNodeMenu(null);
  };

  // ---------------------------------------------------------------------------

  const section = building.sections.find((s) => s.id === activeSectionId);
  const hasImage = !!section?.imageData;

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onMouseLeave={() => { panRef.current = null; hasPannedRef.current = false; }}
    >
      {!hasImage && (
        <div className={styles.placeholder}>
          <span>No map image for this section</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none', cursor: 'grab' }}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      />

      {nodeMenu && (
        <>
          {isSmall && <div className={styles.menuBackdrop} onClick={() => setNodeMenu(null)} />}
          <div
            className={isSmall ? styles.menuSheet : styles.menu}
            style={isSmall ? undefined : {
              left: Math.min(nodeMenu.screenX + 8, nodeMenu.canvasW - 160),
              top: nodeMenu.screenY + 8,
            }}
          >
            {isSmall && <div className={styles.menuDragHandle} />}
            <div className={styles.menuLabel}>{nodeMenu.label}</div>
            <button className={styles.menuBtn} onClick={handleSetOrigin}>Set origin</button>
            <button className={styles.menuBtn} onClick={handleSetDestination}>Set destination</button>
            <button className={styles.menuBtn} onClick={handleToggleFavorite}>
              {favorites.has(nodeMenu.nodeId) ? '★ Remove favorite' : '☆ Add favorite'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
