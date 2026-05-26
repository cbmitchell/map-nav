import type { Building } from '../../types/graph';

interface NavigatorControlsProps {
  building: Building;
  srcId: string | null;
  tgtId: string | null;
  accessibleOnly: boolean;
  showDirections: boolean;
  error: string | null;
  onSrcChange: (id: string | null) => void;
  onTgtChange: (id: string | null) => void;
  onAccessibleToggle: (v: boolean) => void;
  onDirectionsToggle: (v: boolean) => void;
}

export function NavigatorControls({
  building,
  srcId,
  tgtId,
  accessibleOnly,
  showDirections,
  error,
  onSrcChange,
  onTgtChange,
  onAccessibleToggle,
  onDirectionsToggle,
}: NavigatorControlsProps) {
  const rooms = building.nodes.filter((n) => n.isRoom);

  // Group rooms by section name for <optgroup>
  const sectionIndex = new Map(building.sections.map((s) => [s.id, s]));
  const grouped = new Map<string, { sectionName: string; nodes: typeof rooms }>();
  for (const node of rooms) {
    const section = sectionIndex.get(node.sectionId);
    const key = node.sectionId;
    if (!grouped.has(key)) {
      grouped.set(key, { sectionName: section?.name ?? 'Unknown', nodes: [] });
    }
    grouped.get(key)!.nodes.push(node);
  }

  const renderOptions = (excludeId: string | null) =>
    [...grouped.entries()].map(([sectionId, { sectionName, nodes }]) => (
      <optgroup key={sectionId} label={sectionName}>
        {nodes
          .filter((n) => n.id !== excludeId)
          .map((n) => (
            <option key={n.id} value={n.id}>
              {n.label || '(unlabeled)'}
            </option>
          ))}
      </optgroup>
    ));

  const noRooms = rooms.length === 0;

  return (
    <div style={styles.controls}>
      <div style={styles.row}>
        <label style={styles.label}>From</label>
        <select
          style={styles.select}
          value={srcId ?? ''}
          disabled={noRooms}
          onChange={(e) => onSrcChange(e.target.value || null)}
        >
          <option value="">— select origin —</option>
          {renderOptions(tgtId)}
        </select>
      </div>

      <div style={styles.row}>
        <label style={styles.label}>To</label>
        <select
          style={styles.select}
          value={tgtId ?? ''}
          disabled={noRooms}
          onChange={(e) => onTgtChange(e.target.value || null)}
        >
          <option value="">— select destination —</option>
          {renderOptions(srcId)}
        </select>
      </div>

      <div style={styles.divider} />

      <label style={styles.toggle}>
        <input
          type="checkbox"
          checked={accessibleOnly}
          onChange={(e) => onAccessibleToggle(e.target.checked)}
        />
        <span>Accessible route (no stairs)</span>
      </label>

      <label style={styles.toggle}>
        <input
          type="checkbox"
          checked={showDirections}
          onChange={(e) => onDirectionsToggle(e.target.checked)}
        />
        <span>Show directions</span>
      </label>

      {noRooms && (
        <div style={styles.hint}>
          Mark nodes as rooms in the Editor to enable navigation.
        </div>
      )}

      {error && <div style={styles.error}>{error}</div>}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  controls: {
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
    padding: '12px 14px',
    background: '#0e0e0e',
    borderBottom: '1px solid #2a2a2a',
    flexShrink: 0,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  },
  label: {
    fontSize: 12,
    color: '#888',
    width: 32,
    flexShrink: 0,
  },
  select: {
    flex: 1,
    background: '#141414',
    border: '1px solid #333',
    borderRadius: 4,
    color: '#ddd',
    padding: '8px 8px',
    fontSize: 14,
    outline: 'none',
    cursor: 'pointer',
    minHeight: 40,
  },
  divider: {
    height: 1,
    background: '#1e1e1e',
    margin: '2px 0',
  },
  toggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 14,
    color: '#aaa',
    cursor: 'pointer',
    userSelect: 'none' as const,
    minHeight: 36,
  },
  hint: {
    fontSize: 11,
    color: '#555',
    fontStyle: 'italic',
  },
  error: {
    fontSize: 12,
    color: '#D85A30',
    padding: '4px 8px',
    background: 'rgba(216,90,48,0.1)',
    borderRadius: 4,
    border: '1px solid rgba(216,90,48,0.3)',
  },
};
