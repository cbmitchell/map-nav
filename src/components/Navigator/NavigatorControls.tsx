import { useState } from 'react';
import clsx from 'clsx';
import type { Building } from '../../types/graph';
import { useMobile } from '../../hooks/useMobile';
import { DirectionsPanel } from './DirectionsPanel';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import styles from './NavigatorControls.module.css';

type PickMode = 'src' | 'tgt' | null;

interface NavigatorControlsProps {
  building: Building;
  srcId: string | null;
  tgtId: string | null;
  tgtCategory: string | null;
  excludedTypes: Set<string>;
  showDirections: boolean;
  path: string[] | null;
  error: string | null;
  resolvedTgtLabel: string | null;
  pickMode: PickMode;
  activeSectionId: string | null;
  onSrcChange: (id: string | null) => void;
  onTgtChange: (id: string | null) => void;
  onTgtCategoryChange: (category: string | null) => void;
  onExcludedTypesChange: (types: Set<string>) => void;
  onDirectionsToggle: (v: boolean) => void;
  onPickModeChange: (mode: PickMode) => void;
  onSectionChange: (id: string) => void;
}

export function NavigatorControls({
  building,
  srcId,
  tgtId,
  tgtCategory,
  excludedTypes,
  showDirections,
  path,
  error,
  resolvedTgtLabel,
  pickMode,
  activeSectionId,
  onSrcChange,
  onTgtChange,
  onTgtCategoryChange,
  onExcludedTypesChange,
  onDirectionsToggle,
  onPickModeChange,
  onSectionChange,
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

  const toggleExcludedType = (typeId: string, included: boolean) => {
    const next = new Set(excludedTypes);
    if (included) {
      next.delete(typeId);
    } else {
      next.add(typeId);
    }
    onExcludedTypesChange(next);
  };

  return (
    <div className={styles.controls}>
      <CollapsibleSection title="Route" storageKey="nav-route">
        <div className={styles.fieldBlock}>
          <div className={styles.row}>
            <label className={styles.label}>From</label>
            <button
              className={clsx(styles.pickBtn, pickMode === 'src' && styles.pickBtnActive)}
              onClick={() => onPickModeChange(pickMode === 'src' ? null : 'src')}
              title="Pick origin from map"
            >
              {pickMode === 'src' ? 'Picking…' : 'Pick'}
            </button>
          </div>
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

        <div className={styles.fieldBlock}>
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
            {destMode === 'room' && (
              <button
                className={clsx(styles.pickBtn, pickMode === 'tgt' && styles.pickBtnActive)}
                onClick={() => onPickModeChange(pickMode === 'tgt' ? null : 'tgt')}
                title="Pick destination from map"
              >
                {pickMode === 'tgt' ? 'Picking…' : 'Pick'}
              </button>
            )}
          </div>

          {destMode === 'room' ? (
            <select
              className={styles.select}
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
                className={styles.select}
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

        {noRooms && (
          <div className={styles.hint}>
            Mark nodes as rooms in the Editor to enable navigation.
          </div>
        )}

        {error && <div className={styles.error}>{error}</div>}
      </CollapsibleSection>

      <div className={styles.divider} />

      <CollapsibleSection title="Route options" storageKey="nav-route-options">
        <div className={styles.typeList}>
          {building.edgeTypes.map((et) => {
            const included = !excludedTypes.has(et.id);
            return (
              <label key={et.id} className={styles.typeRow}>
                <input
                  type="checkbox"
                  checked={included}
                  onChange={(e) => toggleExcludedType(et.id, e.target.checked)}
                />
                <span className={styles.typeSwatch} style={{ background: et.color }} />
                <span className={styles.typeName}>{et.name}</span>
              </label>
            );
          })}
        </div>
      </CollapsibleSection>

      <div className={styles.divider} />

      <CollapsibleSection title="Directions" storageKey="nav-directions">
        <div className={styles.directionBody}>
          <label className={styles.toggle}>
            <input
              type="checkbox"
              checked={showDirections}
              onChange={(e) => onDirectionsToggle(e.target.checked)}
            />
            <span>Show directions</span>
          </label>
          {showDirections && path && path.length > 0 && (
            <DirectionsPanel building={building} path={path} />
          )}
        </div>
      </CollapsibleSection>

      {building.sections.length > 0 && (
        <>
          <div className={styles.divider} />
          <CollapsibleSection title="Sections" storageKey="nav-sections">
            <div className={styles.sectionList}>
              {building.sections.map((s) => (
                <div
                  key={s.id}
                  className={clsx(styles.sectionItem, s.id === activeSectionId && styles.sectionItemActive)}
                  onClick={() => onSectionChange(s.id)}
                >
                  <span className={styles.sectionName}>{s.name}</span>
                  <span className={styles.sectionFloor}>F{s.floor}</span>
                </div>
              ))}
            </div>
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
