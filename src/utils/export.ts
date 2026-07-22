import type { Building } from '../types/graph';

interface ExportBundle {
  version: number;
  exportedAt: string;
  building: Building;
}

function isValidBuilding(b: unknown): b is Building {
  if (!b || typeof b !== 'object') return false;
  const obj = b as Record<string, unknown>;
  return Array.isArray(obj.sections) && Array.isArray(obj.nodes) && Array.isArray(obj.edges);
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
