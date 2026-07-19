import { useReducer, useEffect, useLayoutEffect, useRef, useCallback, useState } from 'react';
import type { Building, Section, Node, Edge, EdgeTypeDef } from '../types/graph';
import { euclideanWeight } from '../utils/geometry';
import { DEFAULT_EDGE_TYPES, CUSTOM_TYPE_COLORS, computeEdgeWeight } from '../utils/pathfinding';
import { generateId } from '../utils/id';
import { saveImage, getAllImages, deleteImage } from '../utils/imageStore';

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'ADD_SECTION'; payload: Section }
  | { type: 'UPDATE_SECTION'; payload: { id: string; name?: string; floor?: number } }
  | { type: 'UPDATE_SECTION_IMAGE'; payload: { id: string; imageData: string; imageW: number; imageH: number } }
  | { type: 'DELETE_SECTION'; payload: { id: string } }
  | { type: 'ADD_NODE'; payload: Omit<Node, 'id'> }
  | { type: 'UPDATE_NODE'; payload: Partial<Node> & { id: string }; canvasW?: number; canvasH?: number }
  | { type: 'DELETE_NODE'; payload: { id: string } }
  | { type: 'ADD_EDGE'; payload: Omit<Edge, 'id'> }
  | { type: 'UPDATE_EDGE'; payload: Partial<Edge> & { id: string } }
  | { type: 'DELETE_EDGE'; payload: { id: string } }
  | { type: 'SPLIT_EDGE'; payload: { edgeId: string; nx: number; ny: number }; canvasW?: number; canvasH?: number }
  | { type: 'ADD_EDGE_TYPE'; payload: Omit<EdgeTypeDef, 'id' | 'color' | 'dashPattern' | 'isBuiltIn'> }
  | { type: 'UPDATE_EDGE_TYPE'; payload: Omit<EdgeTypeDef, 'id' | 'color' | 'dashPattern' | 'isBuiltIn'> & { id: string } }
  | { type: 'DELETE_EDGE_TYPE'; payload: { id: string } }
  | { type: 'CALIBRATE_SECTION'; payload: { sectionId: string; scale: number } }
  | { type: 'LOAD_BUILDING'; payload: Building };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'office-navigator-state';

// Captured at module load time, before the first saveToStorage effect can overwrite it.
// Used only by hydrateImages() for one-time legacy migration detection.
const _rawStoredState = (() => {
  try { return localStorage.getItem(STORAGE_KEY); } catch { return null; }
})();
let _migrationDone = false;

function emptyBuilding(): Building {
  return { sections: [], nodes: [], edges: [], edgeTypes: DEFAULT_EDGE_TYPES };
}

function migrateBuilding(b: Building): Building {
  if (!b.edgeTypes || b.edgeTypes.length === 0) {
    return { ...b, edgeTypes: DEFAULT_EDGE_TYPES };
  }
  return b;
}

function loadFromStorage(): Building {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = migrateBuilding(JSON.parse(raw) as Building);
      // Strip imageData — images are loaded from IndexedDB separately
      return {
        ...parsed,
        sections: parsed.sections.map((s) => ({ ...s, imageData: '' })),
      };
    }
  } catch {
    // ignore
  }
  return emptyBuilding();
}

function recalcLengthBasedWeights(
  edges: Edge[],
  nodes: Node[],
  sections: Section[],
  edgeTypes: EdgeTypeDef[],
  movedNodeId: string,
): Edge[] {
  const movedNode = nodes.find((n) => n.id === movedNodeId);
  if (!movedNode) return edges;
  const section = sections.find((s) => s.id === movedNode.sectionId);
  const W = section?.imageW ?? 1;
  const H = section?.imageH ?? 1;
  const sectionScale = section?.scale ?? 1.0;
  const typeIndex = new Map(edgeTypes.map((t) => [t.id, t]));
  return edges.map((e) => {
    const typeDef = typeIndex.get(e.type);
    if (!typeDef || typeDef.weightMode !== 'length') return e;
    if (e.srcId !== movedNodeId && e.tgtId !== movedNodeId) return e;
    const otherId = e.srcId === movedNodeId ? e.tgtId : e.srcId;
    const other = nodes.find((n) => n.id === otherId);
    if (!other) return e;
    return { ...e, weight: euclideanWeight(movedNode, other, W, H) * typeDef.lengthScalar * sectionScale };
  });
}

function nextCustomColor(edgeTypes: EdgeTypeDef[]): string {
  const usedColors = new Set(edgeTypes.map((t) => t.color));
  return CUSTOM_TYPE_COLORS.find((c) => !usedColors.has(c)) ?? CUSTOM_TYPE_COLORS[0];
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: Building, action: Action): Building {
  switch (action.type) {
    case 'ADD_SECTION': {
      return { ...state, sections: [...state.sections, action.payload] };
    }

    case 'UPDATE_SECTION': {
      const { id, ...updates } = action.payload;
      return {
        ...state,
        sections: state.sections.map((s) => (s.id === id ? { ...s, ...updates } : s)),
      };
    }

    case 'UPDATE_SECTION_IMAGE': {
      return {
        ...state,
        sections: state.sections.map((s) =>
          s.id === action.payload.id
            ? { ...s, imageData: action.payload.imageData, imageW: action.payload.imageW, imageH: action.payload.imageH }
            : s,
        ),
      };
    }

    case 'DELETE_SECTION': {
      const { id } = action.payload;
      const removedNodeIds = new Set(state.nodes.filter((n) => n.sectionId === id).map((n) => n.id));
      return {
        ...state,
        sections: state.sections.filter((s) => s.id !== id),
        nodes: state.nodes.filter((n) => n.sectionId !== id),
        edges: state.edges.filter((e) => !removedNodeIds.has(e.srcId) && !removedNodeIds.has(e.tgtId)),
      };
    }

    case 'ADD_NODE': {
      const node: Node = { ...action.payload, id: generateId() };
      return { ...state, nodes: [...state.nodes, node] };
    }

    case 'UPDATE_NODE': {
      const { id, ...updates } = action.payload;
      const positionChanged = updates.nx !== undefined || updates.ny !== undefined;
      const updatedNodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      const updatedEdges = positionChanged
        ? recalcLengthBasedWeights(state.edges, updatedNodes, state.sections, state.edgeTypes, id)
        : state.edges;
      return { ...state, nodes: updatedNodes, edges: updatedEdges };
    }

    case 'DELETE_NODE': {
      return {
        ...state,
        nodes: state.nodes.filter((n) => n.id !== action.payload.id),
        edges: state.edges.filter(
          (e) => e.srcId !== action.payload.id && e.tgtId !== action.payload.id,
        ),
      };
    }

    case 'ADD_EDGE': {
      const edge: Edge = { ...action.payload, id: generateId() };
      return { ...state, edges: [...state.edges, edge] };
    }

    case 'UPDATE_EDGE': {
      const { id, ...updates } = action.payload;
      const typeIndex = new Map(state.edgeTypes.map((t) => [t.id, t]));
      return {
        ...state,
        edges: state.edges.map((e) => {
          if (e.id !== id) return e;
          const merged = { ...e, ...updates };
          if (updates.type && updates.type !== e.type) {
            const typeDef = typeIndex.get(merged.type);
            if (typeDef) {
              const src = state.nodes.find((n) => n.id === merged.srcId);
              const tgt = state.nodes.find((n) => n.id === merged.tgtId);
              if (src && tgt) {
                const section = state.sections.find((s) => s.id === src.sectionId);
                const W = section?.imageW ?? 1;
                const H = section?.imageH ?? 1;
                const sectionScale = section?.scale ?? 1.0;
                merged.weight = computeEdgeWeight(typeDef, src, tgt, W, H, sectionScale);
              }
            }
          }
          return merged;
        }),
      };
    }

    case 'DELETE_EDGE': {
      return { ...state, edges: state.edges.filter((e) => e.id !== action.payload.id) };
    }

    case 'SPLIT_EDGE': {
      const { edgeId, nx, ny } = action.payload;
      const edge = state.edges.find((e) => e.id === edgeId);
      if (!edge || edge.crossSection) return state;
      const src = state.nodes.find((n) => n.id === edge.srcId);
      const tgt = state.nodes.find((n) => n.id === edge.tgtId);
      if (!src || !tgt) return state;

      const newNode: Node = {
        id: generateId(),
        sectionId: src.sectionId,
        nx,
        ny,
        label: '',
        isRoom: false,
        isConnector: false,
      };

      const typeDef = state.edgeTypes.find((t) => t.id === edge.type);
      let w1: number, w2: number;
      if (typeDef?.weightMode === 'fixed') {
        w1 = w2 = typeDef.fixedWeight;
      } else {
        const splitSection = state.sections.find((s) => s.id === src.sectionId);
        const sW = splitSection?.imageW ?? 1;
        const sH = splitSection?.imageH ?? 1;
        const splitScale = splitSection?.scale ?? 1.0;
        const scalar = (typeDef?.lengthScalar ?? 1) * splitScale;
        w1 = euclideanWeight(src, newNode, sW, sH) * scalar;
        w2 = euclideanWeight(newNode, tgt, sW, sH) * scalar;
      }

      return {
        ...state,
        nodes: [...state.nodes, newNode],
        edges: [
          ...state.edges.filter((e) => e.id !== edgeId),
          { id: generateId(), srcId: edge.srcId, tgtId: newNode.id, type: edge.type, weight: w1, crossSection: false },
          { id: generateId(), srcId: newNode.id, tgtId: edge.tgtId, type: edge.type, weight: w2, crossSection: false },
        ],
      };
    }

    case 'ADD_EDGE_TYPE': {
      const color = nextCustomColor(state.edgeTypes);
      const newType: EdgeTypeDef = {
        ...action.payload,
        id: generateId(),
        color,
        dashPattern: [],
        isBuiltIn: false,
      };
      return { ...state, edgeTypes: [...state.edgeTypes, newType] };
    }

    case 'UPDATE_EDGE_TYPE': {
      const { id, ...updates } = action.payload;
      const typeDef = state.edgeTypes.find((t) => t.id === id);
      if (!typeDef) return state;
      const updatedType: EdgeTypeDef = { ...typeDef, ...updates };
      const nodeIndex = new Map(state.nodes.map((n) => [n.id, n]));
      const sectionIndex = new Map(state.sections.map((s) => [s.id, s]));
      return {
        ...state,
        edgeTypes: state.edgeTypes.map((t) => (t.id === id ? updatedType : t)),
        edges: state.edges.map((e) => {
          if (e.type !== id) return e;
          const src = nodeIndex.get(e.srcId);
          const tgt = nodeIndex.get(e.tgtId);
          if (!src || !tgt) return e;
          const section = sectionIndex.get(src.sectionId);
          const W = section?.imageW ?? 1;
          const H = section?.imageH ?? 1;
          const sectionScale = section?.scale ?? 1.0;
          return { ...e, weight: computeEdgeWeight(updatedType, src, tgt, W, H, sectionScale) };
        }),
      };
    }

    case 'DELETE_EDGE_TYPE': {
      const { id } = action.payload;
      const typeDef = state.edgeTypes.find((t) => t.id === id);
      if (!typeDef || typeDef.isBuiltIn) return state;
      return {
        ...state,
        edgeTypes: state.edgeTypes.filter((t) => t.id !== id),
        edges: state.edges.map((e) => (e.type === id ? { ...e, type: 'walkway' } : e)),
      };
    }

    case 'CALIBRATE_SECTION': {
      const { sectionId, scale } = action.payload;
      const section = state.sections.find((s) => s.id === sectionId);
      if (!section) return state;
      const W = section.imageW;
      const H = section.imageH;
      const sectionNodeIds = new Set(state.nodes.filter((n) => n.sectionId === sectionId).map((n) => n.id));
      const nodeIndex = new Map(state.nodes.map((n) => [n.id, n]));
      const typeIndex = new Map(state.edgeTypes.map((t) => [t.id, t]));
      const updatedEdges = state.edges.map((e) => {
        if (!sectionNodeIds.has(e.srcId) || !sectionNodeIds.has(e.tgtId) || e.crossSection) return e;
        const typeDef = typeIndex.get(e.type);
        if (!typeDef || typeDef.weightMode !== 'length') return e;
        const src = nodeIndex.get(e.srcId);
        const tgt = nodeIndex.get(e.tgtId);
        if (!src || !tgt) return e;
        return { ...e, weight: euclideanWeight(src, tgt, W, H) * typeDef.lengthScalar * scale };
      });
      return {
        ...state,
        sections: state.sections.map((s) => (s.id === sectionId ? { ...s, scale } : s)),
        edges: updatedEdges,
      };
    }

    case 'LOAD_BUILDING': {
      return migrateBuilding(action.payload);
    }

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const MAX_UNDO = 20;

export function useGraphReducer() {
  const [state, baseDispatch] = useReducer(reducer, undefined, loadFromStorage);
  const [storageError, setStorageError] = useState(false);

  const undoStack = useRef<Building[]>([]);
  const stateRef = useRef(state);
  const prevSectionIdsRef = useRef<Set<string>>(new Set());
  useLayoutEffect(() => { stateRef.current = state; });

  // Stable dispatch wrapper that snapshots state before each mutation
  const dispatch = useCallback((action: Action) => {
    if (action.type !== 'LOAD_BUILDING') {
      undoStack.current = [stateRef.current, ...undoStack.current].slice(0, MAX_UNDO);
    }
    baseDispatch(action);
  }, []);

  const undo = useCallback(() => {
    if (undoStack.current.length === 0) return;
    const [prev, ...rest] = undoStack.current;
    undoStack.current = rest;
    baseDispatch({ type: 'LOAD_BUILDING', payload: prev });
  }, []);

  useEffect(() => {
    // Write structure only (no imageData) to localStorage
    const stripped: Building = {
      ...state,
      sections: state.sections.map((s) => ({ ...s, imageData: '' })),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(stripped));
      setStorageError(false);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'QuotaExceededError') {
        setStorageError(true);
      }
    }

    // Persist images to IndexedDB (fire-and-forget)
    for (const section of state.sections) {
      if (section.imageData) {
        saveImage(section.id, section.imageData).catch(console.error);
      }
    }

    // Purge images for sections that have been removed
    const currentIds = new Set(state.sections.map((s) => s.id));
    for (const prevId of prevSectionIdsRef.current) {
      if (!currentIds.has(prevId)) deleteImage(prevId).catch(console.error);
    }
    prevSectionIdsRef.current = currentIds;
  }, [state]);

  // On mount: migrate legacy imageData from localStorage to IndexedDB, then hydrate state
  useEffect(() => {
    async function hydrateImages() {
      try {
        if (!_migrationDone && _rawStoredState) {
          const parsed = JSON.parse(_rawStoredState) as Building;
          const legacySections = (parsed.sections ?? []).filter((s) => s.imageData);
          if (legacySections.length > 0) {
            await Promise.all(legacySections.map((s) => saveImage(s.id, s.imageData)));
          }
          _migrationDone = true;
        }

        const images = await getAllImages();
        if (images.size === 0) return;

        baseDispatch({
          type: 'LOAD_BUILDING',
          payload: {
            ...stateRef.current,
            sections: stateRef.current.sections.map((s) => ({
              ...s,
              imageData: images.get(s.id) ?? s.imageData,
            })),
          },
        });
      } catch (err) {
        console.error('Failed to load images from IndexedDB:', err);
      }
    }

    hydrateImages();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { state, dispatch, undo, storageError };
}
