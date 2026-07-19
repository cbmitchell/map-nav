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

export interface Building {
  name: string;
  sections: Section[];
  nodes: Node[];
  edges: Edge[];
  edgeTypes: EdgeTypeDef[];
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
