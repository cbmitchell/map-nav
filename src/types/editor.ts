import type { EdgeType } from './graph';

export type EditorMode = 'select' | 'node' | 'edge' | 'link';

export interface EditorState {
  mode: EditorMode;
  currentEdgeType: EdgeType;
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  pendingEdgeSrcId: string | null;
  pendingLinkSrc: { nodeId: string; sectionId: string } | null;
  mousePos: { x: number; y: number } | null;
}

export const DEFAULT_EDITOR_STATE: EditorState = {
  mode: 'select',
  currentEdgeType: 'walkway',
  selectedNodeId: null,
  selectedEdgeId: null,
  pendingEdgeSrcId: null,
  pendingLinkSrc: null,
  mousePos: null,
};
