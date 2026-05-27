import { useState } from 'react';
import clsx from 'clsx';
import type { Building } from '../../types/graph';
import { useMobile } from '../../hooks/useMobile';
import styles from './NavigatorControls.module.css';

interface NavigatorControlsProps {
  building: Building;
  srcId: string | null;
  tgtId: string | null;
  tgtCategory: string | null;
  accessibleOnly: boolean;
  showDirections: boolean;
  error: string | null;
  resolvedTgtLabel: string | null;
  onSrcChange: (id: string | null) => void;
  onTgtChange: (id: string | null) => void;
  onTgtCategoryChange: (category: string | null) => void;
  onAccessibleToggle: (v: boolean) => void;
  onDirectionsToggle: (v: boolean) => void;
}

export function NavigatorControls({
  building,
  srcId,
  tgtId,
  tgtCategory,
  accessibleOnly,
  showDirections,
  error,
  resolvedTgtLabel,
  onSrcChange,
  onTgtChange,
  onTgtCategoryChange,
  onAccessibleToggle,
  onDirectionsToggle,
}: NavigatorControlsProps) {
  const [destMode, setDestMode] = useState<'room' | 'category'>('room');
  const { isMobile } = useMobile();

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

  const knownCategories = [...new Set(
    rooms.filter((n) => n.category).map((n) => n.category as string),
  )].sort();

  const renderRoomOptions = (excludeId: string | null) =>
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

  const handleDestModeChange = (mode: 'room' | 'category') => {
    setDestMode(mode);
    if (mode === 'room') {
      onTgtCategoryChange(null);
    } else {
      onTgtChange(null);
    }
  };

  return (
    <div className={styles.controls}>
      <div className={styles.row}>
        <label className={styles.label}>From</label>
        <select
          className={styles.select}
          value={srcId ?? ''}
          disabled={noRooms}
          onChange={(e) => onSrcChange(e.target.value || null)}
        >
          <option value="">— select origin —</option>
          {renderRoomOptions(destMode === 'room' ? tgtId : null)}
        </select>
      </div>

      <div className={styles.toBlock}>
        <div className={styles.row}>
          <label className={styles.label}>To</label>
          <div className={styles.modeToggle}>
            <button
              className={clsx(styles.modeBtn, destMode === 'room' && styles.modeBtnActive)}
              onClick={() => handleDestModeChange('room')}
            >
              Room
            </button>
            <button
              className={clsx(styles.modeBtn, destMode === 'category' && styles.modeBtnActive)}
              disabled={knownCategories.length === 0}
              onClick={() => handleDestModeChange('category')}
            >
              {isMobile ? 'Nearest' : 'Nearest in category'}
            </button>
          </div>
        </div>

        {destMode === 'room' ? (
          <select
            className={clsx(styles.select, styles.selectIndented)}
            value={tgtId ?? ''}
            disabled={noRooms}
            onChange={(e) => onTgtChange(e.target.value || null)}
          >
            <option value="">— select destination —</option>
            {renderRoomOptions(srcId)}
          </select>
        ) : (
          <>
            <select
              className={clsx(styles.select, styles.selectIndented)}
              value={tgtCategory ?? ''}
              disabled={knownCategories.length === 0}
              onChange={(e) => onTgtCategoryChange(e.target.value || null)}
            >
              <option value="">— select category —</option>
              {knownCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            {tgtCategory && resolvedTgtLabel && (
              <div className={styles.resolvedLabel}>
                Routing to: {resolvedTgtLabel}
              </div>
            )}
            {tgtCategory && !resolvedTgtLabel && (
              <div className={styles.resolvedLabelMissing}>
                No reachable room in this category
              </div>
            )}
          </>
        )}
      </div>

      <div className={styles.divider} />

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={accessibleOnly}
          onChange={(e) => onAccessibleToggle(e.target.checked)}
        />
        <span>Accessible route (no stairs)</span>
      </label>

      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={showDirections}
          onChange={(e) => onDirectionsToggle(e.target.checked)}
        />
        <span>Show directions</span>
      </label>

      {noRooms && (
        <div className={styles.hint}>
          Mark nodes as rooms in the Editor to enable navigation.
        </div>
      )}

      {error && <div className={styles.error}>{error}</div>}
    </div>
  );
}

