import { useReducer, useEffect } from 'react';
import type { Building, Section, Node, Edge, EdgeType } from '../types/graph';
import { euclideanWeight } from '../utils/geometry';
import { FIXED_WEIGHTS } from '../utils/pathfinding';

// ---------------------------------------------------------------------------
// Action types
// ---------------------------------------------------------------------------

export type Action =
  | { type: 'ADD_SECTION'; payload: Omit<Section, 'id'> }
  | { type: 'UPDATE_SECTION_IMAGE'; payload: { id: string; imageData: string; imageW: number; imageH: number } }
  | { type: 'ADD_NODE'; payload: Omit<Node, 'id'> }
  | { type: 'UPDATE_NODE'; payload: Partial<Node> & { id: string } }
  | { type: 'DELETE_NODE'; payload: { id: string } }
  | { type: 'ADD_EDGE'; payload: Omit<Edge, 'id'> }
  | { type: 'UPDATE_EDGE'; payload: Partial<Edge> & { id: string }; nodes: Node[] }
  | { type: 'DELETE_EDGE'; payload: { id: string } }
  | { type: 'LOAD_BUILDING'; payload: Building };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'office-navigator-state';

const CANVAS_WEIGHT_SIZE = 800; // reference canvas size for weight calculations

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
): Edge[] {
  const movedNode = nodes.find((n) => n.id === movedNodeId);
  if (!movedNode) return edges;

  return edges.map((e) => {
    if (e.type !== 'walkway' && e.type !== 'ramp') return e;
    if (e.srcId !== movedNodeId && e.tgtId !== movedNodeId) return e;
    const other = nodes.find((n) => n.id === (e.srcId === movedNodeId ? e.tgtId : e.srcId));
    if (!other) return e;
    return { ...e, weight: euclideanWeight(movedNode, other, CANVAS_WEIGHT_SIZE, CANVAS_WEIGHT_SIZE) };
  });
}

function edgeWeight(type: EdgeType, src: Node, tgt: Node): number {
  const fixed = FIXED_WEIGHTS[type];
  if (fixed !== undefined) return fixed;
  return euclideanWeight(src, tgt, CANVAS_WEIGHT_SIZE, CANVAS_WEIGHT_SIZE);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

function reducer(state: Building, action: Action): Building {
  switch (action.type) {
    case 'ADD_SECTION': {
      const section: Section = { ...action.payload, id: crypto.randomUUID() };
      return { ...state, sections: [...state.sections, section] };
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

      const updatedNodes = state.nodes.map((n) =>
        n.id === id ? { ...n, ...updates } : n,
      );

      const updatedEdges = positionChanged
        ? recalcConnectedWalkwayWeights(state.edges, updatedNodes, id)
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
            const src = action.nodes.find((n) => n.id === merged.srcId);
            const tgt = action.nodes.find((n) => n.id === merged.tgtId);
            if (src && tgt) {
              merged.weight = edgeWeight(merged.type, src, tgt);
            }
          }
          return merged;
        }),
      };
    }

    case 'DELETE_EDGE': {
      return { ...state, edges: state.edges.filter((e) => e.id !== action.payload.id) };
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

export function useGraphReducer() {
  const [state, dispatch] = useReducer(reducer, undefined, loadFromStorage);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // ignore storage failures
    }
  }, [state]);

  return { state, dispatch };
}
