import { useRef, useLayoutEffect, useEffect } from 'react';
import type { Building } from '../../types/graph';
import type { ZoomPanState } from '../../hooks/useZoomPan';
import { useCanvasRenderer } from '../../hooks/useCanvasRenderer';
import { useMobile } from '../../hooks/useMobile';

interface NavigatorCanvasProps {
  building: Building;
  activeSectionId: string | null;
  path: string[] | null;
  zoomPan: ZoomPanState;
  onWheel: (e: WheelEvent, rect: DOMRect) => void;
  onPan: (dx: number, dy: number) => void;
  onZoomAt: (screenX: number, screenY: number, newScale: number) => void;
}

export function NavigatorCanvas({
  building,
  activeSectionId,
  path,
  zoomPan,
  onWheel,
  onPan,
  onZoomAt,
}: NavigatorCanvasProps) {
  const { isMobile, isTablet } = useMobile();
  const isSmall = isMobile || isTablet;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const panRef = useRef<{ lastX: number; lastY: number } | null>(null);
  const spaceRef = useRef(false);
  const touchRef = useRef<{ lastX: number; lastY: number; lastDist: number } | null>(null);
  const zoomPanRef = useRef(zoomPan);
  const buildingRef = useRef(building);
  const activeSectionIdRef = useRef(activeSectionId);

  useLayoutEffect(() => {
    zoomPanRef.current = zoomPan;
    buildingRef.current = building;
    activeSectionIdRef.current = activeSectionId;
  });

  const { redraw } = useCanvasRenderer(
    canvasRef,
    building,
    activeSectionId,
    undefined,
    zoomPan,
    path,
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
      const h = isSmall
        ? Math.max(container.clientHeight, imageAspectH)
        : imageAspectH;
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
  }, [activeSectionId, building.sections, redraw, isSmall]);

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

  // Space key pan mode
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
        if (canvasRef.current) canvasRef.current.style.cursor = 'default';
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

  const handleMouseDown = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    if (e.button === 1 || (e.button === 0 && spaceRef.current)) {
      e.preventDefault();
      panRef.current = { lastX: sx, lastY: sy };
      canvas.style.cursor = 'grabbing';
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!panRef.current) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    onPan(sx - panRef.current.lastX, sy - panRef.current.lastY);
    panRef.current = { lastX: sx, lastY: sy };
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (e.button === 1 || panRef.current) {
      panRef.current = null;
      if (canvasRef.current)
        canvasRef.current.style.cursor = spaceRef.current ? 'grab' : 'default';
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

  const section = building.sections.find((s) => s.id === activeSectionId);
  const hasImage = !!section?.imageData;

  return (
    <div
      ref={containerRef}
      style={{ ...styles.container, ...(isSmall ? { height: '100%' } : {}) }}
      onMouseLeave={() => { panRef.current = null; }}
    >
      {!hasImage && (
        <div style={styles.placeholder}>
          <span>No map image for this section</span>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{ display: 'block', touchAction: 'none' }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => e.preventDefault()}
      />
    </div>
  );
}

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
};
