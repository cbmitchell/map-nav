import { describe, it, expect } from 'vitest';
import { importBuilding } from './export';
import type { Building } from '../types/graph';

function makeFile(content: string): File {
  return new File([content], 'test.json', { type: 'application/json' });
}

const emptyBuilding: Building = { sections: [], nodes: [], edges: [], edgeTypes: [] };

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
});
