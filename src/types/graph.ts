export type EdgeType = 'walkway' | 'stairs' | 'elevator' | 'ramp' | 'bridge';

export interface Building {
  sections: Section[];
  nodes: Node[];
  edges: Edge[];
}

export interface Section {
  id: string;
  name: string;
  floor: number;
  imageData: string;
  imageW: number;
  imageH: number;
}

export interface Node {
  id: string;
  sectionId: string;
  nx: number;
  ny: number;
  label: string;
  isRoom: boolean;
  isConnector: boolean;
}

export interface Edge {
  id: string;
  srcId: string;
  tgtId: string;
  type: EdgeType;
  weight: number;
  crossSection: boolean;
}
