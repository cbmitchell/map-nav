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
  building?: string; // free-text building name, same "combo box creates new value on
                      // entry" convention as Node.category; undefined = unassigned,
                      // grouped under the "(No building)" placeholder
  // Image draw transform, independent of node nx/ny — lets the user pan/rescale a
  // newly swapped-in image to realign it under existing annotations. undefined = identity.
  imageOffsetX?: number; // normalized fraction of content-rect width
  imageOffsetY?: number; // normalized fraction of content-rect height
  imageScale?: number;
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
  isRoomMarker?: boolean; // true = this room node's entrances are defined by its
                          // "Room Entrance" edges rather than being routable itself
  aliases?: string[]; // alternate searchable names; meaningful only when isRoom === true
}

export interface Edge {
  id: string;
  srcId: string;
  tgtId: string;
  type: EdgeType;
  weight: number;
  crossSection: boolean;
}
