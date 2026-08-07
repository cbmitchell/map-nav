import { useState, useMemo } from 'react';
import clsx from 'clsx';
import type { Building } from '../../types/graph';
import { useMobile } from '../../hooks/useMobile';
import { DirectionsPanel } from './DirectionsPanel';
import { CollapsibleSection } from '../shared/CollapsibleSection';
import { SearchableSelect } from '../shared/SearchableSelect';
import type { SearchableSelectOption } from '../shared/SearchableSelect';
import { getDistinctCategories } from '../../utils/categories';
import { groupSectionsByBuilding } from '../../utils/buildings';
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
  hiddenCategories: string[];
  onHiddenCategoriesChange: (next: string[]) => void;
  favorites: string[];
}

type TabId = 'route' | 'options' | 'directions' | 'categories' | 'sections';

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
  hiddenCategories,
  onHiddenCategoriesChange,
  favorites,
}: NavigatorControlsProps) {
  const [destMode, setDestMode] = useState<'room' | 'category'>('room');
  const { isMobile, isTablet } = useMobile();
  const isMobileOrTablet = isMobile || isTablet;

  const [activeTab, setActiveTab] = useState<TabId>('route');
  const [tabExpanded, setTabExpanded] = useState(true);

  const hiddenCategoriesSet = useMemo(() => new Set(hiddenCategories), [hiddenCategories]);
  const favoriteSet = useMemo(() => new Set(favorites), [favorites]);
  const isHiddenCategory = (n: Building['nodes'][number]) =>
    !!(n.category && hiddenCategoriesSet.has(n.category));

  // Feeds only the origin/destination SearchableSelects. Keeps whichever room is
  // currently selected as srcId/tgtId even if its category is hidden, so the
  // SearchableSelect's `selected` lookup doesn't come back empty for an active selection.
  const rooms = building.nodes.filter(
    (n) => n.isRoom && (!isHiddenCategory(n) || n.id === srcId || n.id === tgtId),
  );

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

  // Not derived from `rooms` — must stay unfiltered by hidden state, since it feeds
  // "Nearest in category" (which must remain usable for a hidden category) and the
  // Categories toggle list itself.
  const knownCategories = getDistinctCategories(building.nodes, { roomsOnly: true });

  const roomSelectOptions = (excludeId: string | null): SearchableSelectOption[] => {
    const favOptions: SearchableSelectOption[] = [];
    const restOptions: SearchableSelectOption[] = [];
    for (const { sectionName, nodes } of grouped.values()) {
      for (const n of nodes) {
        if (n.id === excludeId) continue;
        const opt = { id: n.id, label: n.label || '(unlabeled)', groupLabel: sectionName, aliases: n.aliases };
        if (favoriteSet.has(n.id)) {
          favOptions.push({ ...opt, groupLabel: '★ Favorites' });
        } else {
          restOptions.push(opt);
        }
      }
    }
    return [...favOptions, ...restOptions];
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

  const categoriesContent = (
    <div className={styles.typeList}>
      {knownCategories.map((cat) => {
        const hidden = hiddenCategories.includes(cat);
        return (
          <label key={cat} className={styles.typeRow}>
            <input
              type="checkbox"
              checked={!hidden}
              onChange={(e) => {
                const next = e.target.checked
                  ? hiddenCategories.filter((c) => c !== cat)
                  : [...hiddenCategories, cat];
                onHiddenCategoriesChange(next);
              }}
            />
            <span className={styles.typeName}>{cat}</span>
          </label>
        );
      })}
    </div>
  );

  const sectionsContent = (
    <div className={styles.sectionList}>
      {groupSectionsByBuilding(building.sections).map(({ building: buildingName, sections }) => (
        <div key={buildingName}>
          <div className={styles.buildingGroupLabel}>{buildingName}</div>
          {sections.map((s) => (
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
      ))}
    </div>
  );

  if (isMobileOrTablet) {
    const tabs: { id: TabId; label: string; content: React.ReactNode }[] = [
      { id: 'route', label: 'Route', content: routeContent },
      { id: 'options', label: 'Options', content: routeOptionsContent },
      { id: 'directions', label: 'Directions', content: directionsContent },
      ...(knownCategories.length > 0 ? [{ id: 'categories' as const, label: 'Categories', content: categoriesContent }] : []),
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

      {knownCategories.length > 0 && (
        <>
          <div className={styles.divider} />
          <CollapsibleSection title="Categories" storageKey="nav-categories">
            {categoriesContent}
          </CollapsibleSection>
        </>
      )}

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
