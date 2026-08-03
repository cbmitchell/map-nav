export function parseAliases(raw: string, label: string): string[] {
  const labelKey = label.trim().toLowerCase();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of raw.split(',')) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (key === labelKey) continue; // redundant with primary label
    if (seen.has(key)) continue; // dedupe, case-insensitive, first-seen casing wins
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}
