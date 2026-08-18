import { describe, it, expect } from 'vitest';
import { getDistinctBuildings, groupSectionsByBuilding } from './buildings';
import type { Section } from '../types/graph';

function section(id: string, opts: Partial<Section> = {}): Section {
  return { id, name: id, floor: 1, imageData: '', imageW: 1000, imageH: 1000, ...opts };
}

describe('getDistinctBuildings', () => {
  it('treats trailing/leading whitespace as the same building as groupSectionsByBuilding does', () => {
    const sections = [section('a', { building: 'HQ' }), section('b', { building: 'HQ ' })];
    expect(getDistinctBuildings(sections)).toEqual(['HQ']);
    expect(groupSectionsByBuilding(sections).map((g) => g.building)).toEqual(['HQ']);
  });

  it('excludes unassigned sections', () => {
    const sections = [section('a', { building: 'HQ' }), section('b')];
    expect(getDistinctBuildings(sections)).toEqual(['HQ']);
  });
});
