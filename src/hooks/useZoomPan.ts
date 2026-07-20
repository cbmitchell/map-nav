import { useState, useCallback } from 'react';

const MIN_SCALE = 0.25;
const MAX_SCALE = 8;
const ZOOM_STEP = 0.25;
const WHEEL_SENSITIVITY = 0.001;

export interface ZoomPanState {
  scale: number;
  panX: number;
  panY: number;
}

export const DEFAULT_ZOOM_PAN: ZoomPanState = { scale: 1, panX: 0, panY: 0 };

function clampScale(s: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
}

// Convert a point in screen (canvas-element) coords to canvas-content coords
export function screenToCanvas(
  sx: number,
  sy: number,
  { scale, panX, panY }: ZoomPanState,
): { x: number; y: number } {
  return { x: (sx - panX) / scale, y: (sy - panY) / scale };
}

// Compute a ZoomPanState that fits a content-space bounding box within a container of
// size containerW x containerH, leaving at least `padding` screen px on all four sides.
export function fitZoomPan(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  containerW: number,
  containerH: number,
  padding: number,
): ZoomPanState {
  const bboxW = Math.max(bounds.maxX - bounds.minX, 1);
  const bboxH = Math.max(bounds.maxY - bounds.minY, 1);
  const scaleX = (containerW - padding * 2) / bboxW;
  const scaleY = (containerH - padding * 2) / bboxH;
  const scale = clampScale(Math.min(scaleX, scaleY));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return {
    scale,
    panX: containerW / 2 - centerX * scale,
    panY: containerH / 2 - centerY * scale,
  };
}

export function useZoomPan() {
  const [zoomPan, setZoomPan] = useState<ZoomPanState>(DEFAULT_ZOOM_PAN);

  // Zoom centered on a point in screen coords
  const zoomAt = useCallback((screenX: number, screenY: number, newScale: number) => {
    setZoomPan((prev) => {
      const clamped = clampScale(newScale);
      // Keep the point under the cursor fixed
      const panX = screenX - (screenX - prev.panX) * (clamped / prev.scale);
      const panY = screenY - (screenY - prev.panY) * (clamped / prev.scale);
      return { scale: clamped, panX, panY };
    });
  }, []);

  const zoomIn = useCallback((centerX?: number, centerY?: number) => {
    setZoomPan((prev) => {
      const newScale = clampScale(
        Math.round((prev.scale + ZOOM_STEP) / ZOOM_STEP) * ZOOM_STEP,
      );
      const cx = centerX ?? 0;
      const cy = centerY ?? 0;
      const panX = cx - (cx - prev.panX) * (newScale / prev.scale);
      const panY = cy - (cy - prev.panY) * (newScale / prev.scale);
      return { scale: newScale, panX, panY };
    });
  }, []);

  const zoomOut = useCallback((centerX?: number, centerY?: number) => {
    setZoomPan((prev) => {
      const newScale = clampScale(
        Math.floor((prev.scale - ZOOM_STEP / 2) / ZOOM_STEP) * ZOOM_STEP,
      );
      const cx = centerX ?? 0;
      const cy = centerY ?? 0;
      const panX = cx - (cx - prev.panX) * (newScale / prev.scale);
      const panY = cy - (cy - prev.panY) * (newScale / prev.scale);
      return { scale: newScale, panX, panY };
    });
  }, []);

  const resetView = useCallback(() => {
    setZoomPan(DEFAULT_ZOOM_PAN);
  }, []);

  const handleWheel = useCallback(
    (e: WheelEvent, canvasRect: DOMRect) => {
      e.preventDefault();
      const screenX = e.clientX - canvasRect.left;
      const screenY = e.clientY - canvasRect.top;
      setZoomPan((prev) => {
        const delta = -e.deltaY * WHEEL_SENSITIVITY * prev.scale;
        const newScale = clampScale(prev.scale + delta);
        const panX = screenX - (screenX - prev.panX) * (newScale / prev.scale);
        const panY = screenY - (screenY - prev.panY) * (newScale / prev.scale);
        return { scale: newScale, panX, panY };
      });
    },
    [],
  );

  // Returns a mousemove handler delta to apply panning; call with raw movement
  const pan = useCallback((dx: number, dy: number) => {
    setZoomPan((prev) => ({ ...prev, panX: prev.panX + dx, panY: prev.panY + dy }));
  }, []);

  const setView = useCallback((state: ZoomPanState) => {
    setZoomPan(state);
  }, []);

  return { zoomPan, zoomIn, zoomOut, zoomAt, resetView, handleWheel, pan, setView };
}
