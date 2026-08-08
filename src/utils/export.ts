import type { Building } from '../types/graph';

interface ExportBundle {
  version: number;
  exportedAt: string;
  building: Building;
}

function isValidSection(s: unknown): boolean {
  if (!s || typeof s !== 'object') return false;
  const obj = s as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.name === 'string' &&
    typeof obj.floor === 'number' &&
    typeof obj.imageData === 'string' &&
    typeof obj.imageW === 'number' &&
    typeof obj.imageH === 'number'
  );
}

function isValidNode(n: unknown): boolean {
  if (!n || typeof n !== 'object') return false;
  const obj = n as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.sectionId === 'string' &&
    typeof obj.nx === 'number' &&
    typeof obj.ny === 'number' &&
    typeof obj.label === 'string' &&
    typeof obj.isRoom === 'boolean' &&
    typeof obj.isConnector === 'boolean'
  );
}

function isValidEdge(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const obj = e as Record<string, unknown>;
  return (
    typeof obj.id === 'string' &&
    typeof obj.srcId === 'string' &&
    typeof obj.tgtId === 'string' &&
    typeof obj.type === 'string' &&
    typeof obj.weight === 'number' &&
    typeof obj.crossSection === 'boolean'
  );
}

// Beyond basic array/field-shape checks, this also verifies referential integrity
// (every edge endpoint points at a node that actually exists, every node's sectionId
// points at a section that exists) — a hand-edited or truncated export file can pass a
// shallow array check but still crash canvas rendering or Dijkstra downstream, far from
// the actual point of failure. Rejecting it here gives the user an immediate, clear
// import error instead.
function isValidBuilding(b: unknown): b is Building {
  if (!b || typeof b !== 'object') return false;
  const obj = b as Record<string, unknown>;
  if (!Array.isArray(obj.sections) || !Array.isArray(obj.nodes) || !Array.isArray(obj.edges)) return false;
  if (!obj.sections.every(isValidSection) || !obj.nodes.every(isValidNode) || !obj.edges.every(isValidEdge)) {
    return false;
  }

  const sectionIds = new Set((obj.sections as { id: string }[]).map((s) => s.id));
  const nodeIds = new Set((obj.nodes as { id: string }[]).map((n) => n.id));
  const nodesValid = (obj.nodes as { sectionId: string }[]).every((n) => sectionIds.has(n.sectionId));
  const edgesValid = (obj.edges as { srcId: string; tgtId: string }[]).every(
    (e) => nodeIds.has(e.srcId) && nodeIds.has(e.tgtId),
  );
  return nodesValid && edgesValid;
}

export function exportBuilding(building: Building): void {
  const bundle: ExportBundle = {
    version: 1,
    exportedAt: new Date().toISOString(),
    building,
  };
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${building.name.trim().toLowerCase().replace(/\s+/g, '-')}.json`;
  a.click();
  // Defer revocation so the browser has time to initiate the download
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function importBuilding(file: File): Promise<Building> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
        if (raw.version === undefined) {
          reject(new Error('Invalid file: missing version field'));
          return;
        }
        if (!isValidBuilding(raw.building)) {
          reject(new Error('Invalid file: building data is missing or malformed'));
          return;
        }
        resolve(raw.building);
      } catch {
        reject(new Error('Failed to parse file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
