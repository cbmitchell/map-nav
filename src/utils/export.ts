import type { Building } from '../types/graph';

interface ExportBundle {
  version: number;
  exportedAt: string;
  building: Building;
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
  a.download = 'office-navigator.json';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importBuilding(file: File): Promise<Building> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const bundle = JSON.parse(ev.target?.result as string) as ExportBundle;
        if (bundle.version === undefined) {
          reject(new Error('Invalid file: missing version field'));
          return;
        }
        resolve(bundle.building);
      } catch {
        reject(new Error('Failed to parse file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
