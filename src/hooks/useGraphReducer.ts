import { useReducer, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import type { Building, Section, Node, Edge, EdgeType } from '../types/graph';
import { euclideanWeight } from '../utils/geometry';
import { FIXED_WEIGHTS } from '../utils/pathfinding';

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'ADD_SECTION'; payload: Section }
  | { type: 'UPDATE_SECTION'; payload: { id: string; name?: string; floor?: number } }
  | { type: 'UPDATE_SECTION_IMAGE'; payload: { id: string; imageData: string; imageW: number; imageH: number } }
  | { type: 'ADD_NODE'; payload: Omit<Node, 'id'> }
  | { type: 'UPDATE_NODE'; payload: Partial<Node> & { id: string }; canvasW?: number; canvasH?: number }
  | { type: 'DELETE_NODE'; payload: { id: string } }
  | { type: 'ADD_EDGE'; payload: Omit<Edge, 'id'> }
  | { type: 'UPDATE_EDGE'; payload: Partial<Edge> & { id: string } }
  | { type: 'DELETE_EDGE'; payload: { id: string } }
  | { type: 'SPLIT_EDGE'; payload: { edgeId: string; nx: number; ny: number }; canvasW?: number; canvasH?: number }
  | { type: 'LOAD_BUILDING'; payload: Building };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'office-navigator-state';

function emptyBuilding(): Building {
  return { sections: [], nodes: [], edges: [] };
}

function loadFromStorage(): Building {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Building;
  } catch {
    // ignore
  }
  return emptyBuilding();
}

function recalcConnectedWalkwayWeights(
  edges: Edge[],
  nodes: Node[],
  movedNodeId: string,
  canvasW: number,
  canvasH: number,
): Edge[] {
  const movedNode = nodes.find((n) => n.id === movedNodeId);
  if (!movedNode) return edges;
  return edges.map((e) => {
    if (e.type !== 'walkway' && e.type !== 'ramp') return e;
    if (e.srcId !== movedNodeId && e.tgtId !== movedNodeId) return e;
    const otherId = e.srcId === movedNodeId ? e.tgtId : e.srcId;
    const other = nodes.find((n) => n.id === otherId);
    if (!other) return e;
    return { ...e, weight: euclideanWeight(movedNode, other, canvasW, canvasH) };
  });
}

function edgeWeight(type: EdgeType, src: Node, tgt: Node, canvasW: number, canvasH: number): number {
  const fixed = FIXED_WEIGHTS[type];
  return fixed !== undefined ? fixed : euclideanWeight(src, tgt, canvasW, canvasH);
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

    case 'ADD_NODE': {
      const node: Node = { ...action.payload, id: crypto.randomUUID() };
      return { ...state, nodes: [...state.nodes, node] };
    }

    case 'UPDATE_NODE': {
      const { id, ...updates } = action.payload;
      const positionChanged = updates.nx !== undefined || updates.ny !== undefined;
      const updatedNodes = state.nodes.map((n) => (n.id === id ? { ...n, ...updates } : n));
      const updatedEdges =
        positionChanged && action.canvasW && action.canvasH
          ? recalcConnectedWalkwayWeights(state.edges, updatedNodes, id, action.canvasW, action.canvasH)
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
      const edge: Edge = { ...action.payload, id: crypto.randomUUID() };
      return { ...state, edges: [...state.edges, edge] };
    }

    case 'UPDATE_EDGE': {
      const { id, ...updates } = action.payload;
      return {
        ...state,
        edges: state.edges.map((e) => {
          if (e.id !== id) return e;
          const merged = { ...e, ...updates };
          if (updates.type && updates.type !== e.type) {
            const src = state.nodes.find((n) => n.id === merged.srcId);
            const tgt = state.nodes.find((n) => n.id === merged.tgtId);
            if (src && tgt) {
              const section = state.sections.find((s) => s.id === src.sectionId);
              const W = section?.imageW ?? 1;
              const H = section?.imageH ?? 1;
              merged.weight = edgeWeight(merged.type, src, tgt, W, H);
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
        id: crypto.randomUUID(),
        sectionId: src.sectionId,
        nx,
        ny,
        label: '',
        isRoom: false,
        isConnector: false,
      };

      const fixedWeight = FIXED_WEIGHTS[edge.type];
      let w1: number, w2: number;
      if (fixedWeight !== undefined) {
        w1 = w2 = fixedWeight;
      } else if (action.canvasW && action.canvasH) {
        w1 = euclideanWeight(src, newNode, action.canvasW, action.canvasH);
        w2 = euclideanWeight(newNode, tgt, action.canvasW, action.canvasH);
      } else {
        // Proportional split by normalized distance (fallback)
        const dSrc = Math.hypot(nx - src.nx, ny - src.ny);
        const dTgt = Math.hypot(nx - tgt.nx, ny - tgt.ny);
        const total = dSrc + dTgt || 1;
        w1 = edge.weight * (dSrc / total);
        w2 = edge.weight * (dTgt / total);
      }

      return {
        ...state,
        nodes: [...state.nodes, newNode],
        edges: [
          ...state.edges.filter((e) => e.id !== edgeId),
          { id: crypto.randomUUID(), srcId: edge.srcId, tgtId: newNode.id, type: edge.type, weight: w1, crossSection: false },
          { id: crypto.randomUUID(), srcId: newNode.id, tgtId: edge.tgtId, type: edge.type, weight: w2, crossSection: false },
        ],
      };
    }

    case 'LOAD_BUILDING': {
      return action.payload;
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

  const undoStack = useRef<Building[]>([]);
  const stateRef = useRef(state);
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage failures
    }
  }, [state]);

  return { state, dispatch, undo };
}
