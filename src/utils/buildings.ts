import type { Section } from '../types/graph';

export const NO_BUILDING_LABEL = '(No building)';

export function getDistinctBuildings(sections: Section[]): string[] {
  return [...new Set(sections.map((s) => s.building).filter((b): b is string => !!b))].sort();
}

// Groups sections by building (alphabetical; unassigned sections grouped last under
// NO_BUILDING_LABEL), each group's sections ordered by floor descending (higher floors
// first, per "higher floors at the top of the list"), ties broken alphabetically by name.
// `showLabel` is false for the NO_BUILDING_LABEL group when no building has been
// defined anywhere yet — with nothing to distinguish it from, a "(No building)" header
// would be pure noise, so it should only appear once at least one real building exists.
export function groupSectionsByBuilding(
  sections: Section[],
): { building: string; showLabel: boolean; sections: Section[] }[] {
  const groups = new Map<string, Section[]>();
  for (const s of sections) {
    const key = s.building?.trim() || NO_BUILDING_LABEL;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  const namedBuildings = [...groups.keys()].filter((b) => b !== NO_BUILDING_LABEL).sort();
  const orderedKeys = groups.has(NO_BUILDING_LABEL) ? [...namedBuildings, NO_BUILDING_LABEL] : namedBuildings;
  return orderedKeys.map((building) => ({
    building,
    showLabel: building !== NO_BUILDING_LABEL || namedBuildings.length > 0,
    sections: groups.get(building)!.sort((a, b) => b.floor - a.floor || a.name.localeCompare(b.name)),
  }));
}

// The section the Navigator should open on: floor 1 in the alphabetically-first named
// building; falls back to that building's lowest floor if it has no literal floor 1,
// and falls back to considering all sections if none are assigned to a building yet.
export function getDefaultSection(sections: Section[]): Section | null {
  if (sections.length === 0) return null;
  const namedBuildings = getDistinctBuildings(sections);
  const pool = namedBuildings.length > 0
    ? sections.filter((s) => s.building === namedBuildings[0])
    : sections;
  return pool.find((s) => s.floor === 1) ?? [...pool].sort((a, b) => a.floor - b.floor)[0] ?? null;
}
