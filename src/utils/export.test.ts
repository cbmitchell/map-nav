import { describe, it, expect } from 'vitest';
import { importBuilding } from './export';
import type { Building } from '../types/graph';

function makeFile(content: string): File {
  return new File([content], 'test.json', { type: 'application/json' });
}

const emptyBuilding: Building = { name: 'Untitled Building', sections: [], nodes: [], edges: [], edgeTypes: [] };

describe('importBuilding', () => {
  it('resolves with the building from a valid bundle', async () => {
    const bundle = { version: 1, exportedAt: new Date().toISOString(), building: emptyBuilding };
    const result = await importBuilding(makeFile(JSON.stringify(bundle)));
    expect(result).toEqual(emptyBuilding);
  });

  it('rejects when the version field is missing', async () => {
    const bundle = { building: emptyBuilding };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(
      /missing version field/,
    );
  });

  it('rejects when building.sections is missing', async () => {
    const bundle = { version: 1, building: { nodes: [], edges: [] } };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(
      /malformed/,
    );
  });

  it('rejects when building.nodes is missing', async () => {
    const bundle = { version: 1, building: { sections: [], edges: [] } };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(
      /malformed/,
    );
  });

  it('rejects when building.edges is missing', async () => {
    const bundle = { version: 1, building: { sections: [], nodes: [] } };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(
      /malformed/,
    );
  });

  it('rejects when the file contains invalid JSON', async () => {
    await expect(importBuilding(makeFile('not json at all'))).rejects.toThrow(
      /Failed to parse/,
    );
  });

  it('rejects when building field is null', async () => {
    const bundle = { version: 1, building: null };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(
      /malformed/,
    );
  });

  it('resolves with a well-formed building containing sections, nodes, and edges', async () => {
    const b: Building = {
      name: 'Test',
      sections: [{ id: 's1', name: 'Floor 1', floor: 1, imageData: '', imageW: 100, imageH: 100 }],
      nodes: [{ id: 'n1', sectionId: 's1', nx: 0, ny: 0, label: '', isRoom: false, isConnector: false }],
      edges: [{ id: 'e1', srcId: 'n1', tgtId: 'n1', type: 'walkway', weight: 0, crossSection: false }],
      edgeTypes: [],
    };
    const bundle = { version: 1, exportedAt: new Date().toISOString(), building: b };
    const result = await importBuilding(makeFile(JSON.stringify(bundle)));
    expect(result).toEqual(b);
  });

  it('rejects when an edge references a node id that does not exist', async () => {
    const b = {
      name: 'Test',
      sections: [{ id: 's1', name: 'Floor 1', floor: 1, imageData: '', imageW: 100, imageH: 100 }],
      nodes: [{ id: 'n1', sectionId: 's1', nx: 0, ny: 0, label: '', isRoom: false, isConnector: false }],
      edges: [{ id: 'e1', srcId: 'n1', tgtId: 'ghost', type: 'walkway', weight: 0, crossSection: false }],
      edgeTypes: [],
    };
    const bundle = { version: 1, building: b };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(/malformed/);
  });

  it('rejects when a node references a section id that does not exist', async () => {
    const b = {
      name: 'Test',
      sections: [],
      nodes: [{ id: 'n1', sectionId: 'ghost', nx: 0, ny: 0, label: '', isRoom: false, isConnector: false }],
      edges: [],
      edgeTypes: [],
    };
    const bundle = { version: 1, building: b };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(/malformed/);
  });

  it('rejects when a node is missing required fields (e.g. nx)', async () => {
    const b = {
      name: 'Test',
      sections: [{ id: 's1', name: 'Floor 1', floor: 1, imageData: '', imageW: 100, imageH: 100 }],
      nodes: [{ id: 'n1', sectionId: 's1', ny: 0, label: '', isRoom: false, isConnector: false }],
      edges: [],
      edgeTypes: [],
    };
    const bundle = { version: 1, building: b };
    await expect(importBuilding(makeFile(JSON.stringify(bundle)))).rejects.toThrow(/malformed/);
  });
});
