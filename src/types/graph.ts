export type EdgeType = string;

export interface EdgeTypeDef {
  id: string;
  name: string;
  color: string;
  dashPattern: number[];
  weightMode: 'fixed' | 'length';
  fixedWeight: number;
  lengthScalar: number;
  isAccessible: boolean;
  isBuiltIn: boolean;
}

export interface RoomGroup {
  id: string;
  name: string;           // display name, independent of any member node's own label
  nodeIds: string[];       // member entrance node ids (real routing candidates)
  markerNodeId?: string;   // optional display-only anchor node id; excluded from
                            // pathfinding entirely, even if it has edges
}

export interface Building {
  name: string;
  sections: Section[];
  nodes: Node[];
  edges: Edge[];
  edgeTypes: EdgeTypeDef[];
  roomGroups: RoomGroup[];
}

export interface Section {
  id: string;
  name: string;
  floor: number;
  imageData: string;
  imageW: number;
  imageH: number;
  scale?: number; // real-world units per image pixel; undefined = uncalibrated (treated as 1.0)
}

export interface Node {
  id: string;
  sectionId: string;
  nx: number;
  ny: number;
  label: string;
  isRoom: boolean;
  isConnector: boolean;
  category?: string;
}

export interface Edge {
  id: string;
  srcId: string;
  tgtId: string;
  type: EdgeType;
  weight: number;
  crossSection: boolean;
}
