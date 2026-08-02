import { useState } from 'react';
import clsx from 'clsx';
import type { Building } from '../../types/graph';
import { useMobile } from '../../hooks/useMobile';
import { ROOM_GROUP_PREFIX } from '../../utils/roomGroups';
import { DirectionsPanel } from './DirectionsPanel';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { SearchableSelect } from '../shared/SearchableSelect';
import type { SearchableSelectOption } from '../shared/SearchableSelect';
import styles from './NavigatorControls.module.css';

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
  originLabel?: string | null;
  destinationLabel?: string | null;
  activeSectionId: string | null;
  onSrcChange: (id: string | null) => void;
  onTgtChange: (id: string | null) => void;
  onTgtCategoryChange: (category: string | null) => void;
  onExcludedTypesChange: (types: Set<string>) => void;
  onDirectionsToggle: (v: boolean) => void;
  onSectionChange: (id: string) => void;
}

type TabId = 'route' | 'options' | 'directions' | 'sections';

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
  originLabel,
  destinationLabel,
  activeSectionId,
  onSrcChange,
  onTgtChange,
  onTgtCategoryChange,
  onExcludedTypesChange,
  onDirectionsToggle,
  onSectionChange,
}: NavigatorControlsProps) {
  const [destMode, setDestMode] = useState<'room' | 'category'>('room');
  const { isMobile, isTablet } = useMobile();
  const isMobileOrTablet = isMobile || isTablet;

  const [activeTab, setActiveTab] = useState<TabId>('route');
  const [tabExpanded, setTabExpanded] = useState(true);

  const rooms = building.nodes.filter((n) => n.isRoom);
  const sectionIndex = new Map(building.sections.map((s) => [s.id, s]));
  const nodeIndex = new Map(building.nodes.map((n) => [n.id, n]));

  const knownCategories = [...new Set(
    rooms.filter((n) => n.category).map((n) => n.category as string),
  )].sort();

  // Nodes belonging to a room group collapse into a single option (id-encoded with
  // ROOM_GROUP_PREFIX) representing the whole room — routing later picks whichever
  // member entrance is actually cheapest. Ungrouped rooms behave as before.
  const groupedNodeIds = new Set(
    building.roomGroups.flatMap((g) => [...g.nodeIds, ...(g.markerNodeId ? [g.markerNodeId] : [])]),
  );

  const roomSelectOptions = (excludeId: string | null): SearchableSelectOption[] => {
    const options: SearchableSelectOption[] = [];
    for (const g of building.roomGroups) {
      if (g.nodeIds.length === 0) continue;
      const optionId = `${ROOM_GROUP_PREFIX}${g.id}`;
      if (optionId === excludeId) continue;
      const rep = nodeIndex.get(g.markerNodeId ?? g.nodeIds[0]);
      const sectionName = sectionIndex.get(rep?.sectionId ?? '')?.name ?? 'Unknown';
      options.push({ id: optionId, label: g.name, groupLabel: sectionName });
    }
    for (const n of rooms) {
      if (groupedNodeIds.has(n.id) || n.id === excludeId) continue;
      const sectionName = sectionIndex.get(n.sectionId)?.name ?? 'Unknown';
      options.push({ id: n.id, label: n.label || '(unlabeled)', groupLabel: sectionName });
    }
    return options;
  };

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

  const hasSections = building.sections.length > 0;

  const routeContent = (
    <>
      <div className={styles.fieldBlock}>
        <div className={styles.row}>
          <label className={styles.label}>From</label>
        </div>
        <SearchableSelect
          options={roomSelectOptions(destMode === 'room' ? tgtId : null)}
          value={srcId}
          onChange={onSrcChange}
          placeholder="— select origin —"
          disabled={noRooms}
        />
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
        </div>

        {destMode === 'room' ? (
          <SearchableSelect
            options={roomSelectOptions(srcId)}
            value={tgtId}
            onChange={onTgtChange}
            placeholder="— select destination —"
            disabled={noRooms}
          />
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
    </>
  );

  const routeOptionsContent = (
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
  );

  const directionsContent = (
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
        <DirectionsPanel
          building={building}
          path={path}
          originLabel={originLabel}
          destinationLabel={destinationLabel}
        />
      )}
    </div>
  );

  const sectionsContent = (
    <div className={styles.sectionList}>
      {[...building.sections].sort((a, b) => a.name.localeCompare(b.name)).map((s) => (
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
  );

  if (isMobileOrTablet) {
    const tabs: { id: TabId; label: string; content: React.ReactNode }[] = [
      { id: 'route', label: 'Route', content: routeContent },
      { id: 'options', label: 'Options', content: routeOptionsContent },
      { id: 'directions', label: 'Directions', content: directionsContent },
      ...(hasSections ? [{ id: 'sections' as const, label: 'Sections', content: sectionsContent }] : []),
    ];
    const active = tabs.find((t) => t.id === activeTab) ?? tabs[0];

    const handleTabClick = (id: TabId) => {
      if (id === activeTab) {
        setTabExpanded((prev) => !prev);
      } else {
        setActiveTab(id);
        setTabExpanded(true);
      }
    };

    return (
      <div className={styles.controls}>
        <div className={styles.tabBar}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={clsx(styles.tab, t.id === activeTab && styles.tabActive)}
              onClick={() => handleTabClick(t.id)}
            >
              {t.label}
              {t.id === activeTab && (
                <span className={clsx(styles.tabChevron, tabExpanded && styles.tabChevronOpen)} />
              )}
            </button>
          ))}
        </div>
        {tabExpanded && <div className={styles.tabContent}>{active.content}</div>}
      </div>
    );
  }

  return (
    <div className={styles.controls}>
      <CollapsibleSection title="Route" storageKey="nav-route">
        {routeContent}
      </CollapsibleSection>

      <div className={styles.divider} />

      <CollapsibleSection title="Route options" storageKey="nav-route-options">
        {routeOptionsContent}
      </CollapsibleSection>

      <div className={styles.divider} />

      <CollapsibleSection title="Directions" storageKey="nav-directions">
        {directionsContent}
      </CollapsibleSection>

      {hasSections && (
        <>
          <div className={styles.divider} />
          <CollapsibleSection title="Sections" storageKey="nav-sections">
            {sectionsContent}
          </CollapsibleSection>
        </>
      )}
    </div>
  );
}
