# CLAUDE.md — Office Navigator

Persistent reference for Claude Code. Read this at the start of every session.
Architecture decisions here are settled — don't relitigate them without a specific reason.

---

## Project overview

A single-page React application for annotating office building maps with a traversable
graph, and then navigating that graph to find paths between named rooms. Built primarily
for personal use by a new hire navigating a large office building, with the intention of
sharing with future new hires.

The app has two modes, toggled in the UI:
- **Editor mode** — upload map images, annotate them with nodes and edges, label rooms,
  connect sections across floors
- **Navigator mode** — select origin and destination from named rooms, view the shortest
  path highlighted on the map with optional step-by-step waypoint instructions

---

## Tech stack

- **React** with TypeScript
- **Vite** as the build tool
- **useReducer** for all graph state management
- **HTML Canvas** (`<canvas>`) for map rendering and graph annotation — not SVG
- No UI component library — plain HTML elements with custom CSS
- No routing library — mode switching is internal React state
- No backend — entirely client-side

---

## File structure

```
src/
  components/
    Editor/
      Editor.tsx             # editor shell component
      EditorCanvas.tsx       # canvas rendering + mouse interaction
      EditorToolbar.tsx      # mode/tool/edge-type controls
      EditorSidebar.tsx      # section/floor management, cross-section connections, edge type management
    Navigator/
      Navigator.tsx          # navigator shell, per-section zoom retention
      NavigatorCanvas.tsx    # read-only canvas with path highlight
      NavigatorControls.tsx  # origin/destination dropdowns, category routing, directions toggle
      DirectionsPanel.tsx    # toggleable waypoint instruction list
    shared/
      AppShell.tsx           # top-level layout, mode toggle, owns useGraphReducer instance
      ErrorBoundary.tsx      # error boundary wrapper
  hooks/
    useGraphReducer.ts       # useReducer for all graph state + localStorage/IndexedDB sync
    usePathfinder.ts         # Dijkstra wrappers, accessibility filtering
    useCanvasRenderer.ts     # shared canvas draw logic (editor + navigator)
    useMobile.ts             # mobile detection hook
    useZoomPan.ts            # zoom/pan state hook
  types/
    graph.ts                 # all TypeScript interfaces (canonical source of truth)
    editor.ts                # EditorMode, EditorState types
  utils/
    geometry.ts              # hit detection, euclidean distance, norm/px conversion
    export.ts                # serialize/deserialize graph bundle (base64-in-JSON)
    pathfinding.ts           # Dijkstra algorithm (pure function, no React)
    pdf.ts                   # PDF import utility
    id.ts                    # ID generation (generateId wrapping crypto.randomUUID)
    imageStore.ts            # IndexedDB CRUD for section images (save/getAll/delete)
```

---

## Data model

These interfaces are the canonical source of truth. Do not deviate from them without
updating this file.

```ts
type EdgeType = string; // built-in IDs: 'walkway' | 'stairs' | 'elevator' | 'ramp'; custom types are user-defined strings

interface EdgeTypeDef {
  id: string;
  name: string;
  color: string;           // hex color for canvas rendering
  dashPattern: number[];   // [] = solid; [12,6] = long dash; [4,4] = short dash
  weightMode: 'fixed' | 'length';
  fixedWeight: number;     // used when weightMode === 'fixed'
  lengthScalar: number;    // multiplied by euclidean distance when weightMode === 'length'
  isAccessible: boolean;   // false = excluded when "Accessible route" is enabled
  isBuiltIn: boolean;      // true = cannot be deleted by the user
}

interface Building {
  name: string;            // displayed in the top bar; editable in Editor mode, read-only in Navigator mode
  sections: Section[];
  nodes: Node[];
  edges: Edge[];
  edgeTypes: EdgeTypeDef[]; // built-in defaults + any user-created custom types
}

interface Section {
  id: string;
  name: string;         // e.g. "Floor 3 – Tower 1"
  floor: number;        // logical floor number (1, 2, 3...)
  imageData: string;    // base64-encoded image (PNG or JPG)
  imageW: number;       // natural image width in pixels
  imageH: number;       // natural image height in pixels
  scale?: number;       // real-world units per image pixel; undefined = uncalibrated (treated as 1.0)
}

interface Node {
  id: string;
  sectionId: string;    // which Section this node was placed on
  nx: number;           // normalized x position (0.0–1.0) relative to section image
  ny: number;           // normalized y position (0.0–1.0) relative to section image
  label: string;        // display name, empty string if unlabeled
  isRoom: boolean;      // true = appears in navigator origin/destination dropdowns
  isConnector: boolean; // true = stairwell landing, elevator door, etc.
  category?: string;    // optional grouping for nearest-in-category routing
}

interface Edge {
  id: string;
  srcId: string;
  tgtId: string;
  type: EdgeType;
  weight: number;        // computed at creation time; recalculated on node drag or type change
  crossSection: boolean; // true if src and tgt belong to different sections
}
```

### Default edge types (defined in `src/utils/pathfinding.ts`)

The four built-in types are seeded into every new `Building` as `DEFAULT_EDGE_TYPES`. Users can add custom types alongside them via the sidebar.

```ts
// Built-in defaults (weightMode and fixedWeight shown for each)
walkway:  { weightMode: 'length', lengthScalar: 1.0, isAccessible: true  }
stairs:   { weightMode: 'fixed',  fixedWeight: 150,  isAccessible: false }
elevator: { weightMode: 'fixed',  fixedWeight: 300,  isAccessible: true  }
ramp:     { weightMode: 'length', lengthScalar: 1.0, isAccessible: true  }
```

Edge weight for `length` types = `euclideanPixelDistance × lengthScalar × section.scale`.
Edge weight for `fixed` types = `fixedWeight` (constant, not affected by position or scale).

### Coordinate system

All node positions are stored as normalized fractions (0.0–1.0) of their section image's
natural dimensions. Convert to canvas pixels for rendering by multiplying by the canvas's
displayed width/height. This ensures graph overlays correctly regardless of how the image
is displayed.

---

## Graph state — useReducer

All mutations to Building state go through the reducer. No direct state mutation elsewhere.

Action types:
- `UPDATE_BUILDING_NAME` — rename the building (shown in the top bar)
- `ADD_SECTION` — add a new section (floor + image)
- `UPDATE_SECTION` — rename a section or change its floor number
- `UPDATE_SECTION_IMAGE` — set/replace the image for a section
- `DELETE_SECTION` — remove a section and cascade-delete all nodes/edges on it (including cross-section edges into other floors); cleans up the section's stored image
- `ADD_NODE` — place a node on a section
- `UPDATE_NODE` — update label, isRoom, isConnector, category, or position (position change recalculates affected edge weights)
- `DELETE_NODE` — remove node and all its edges
- `ADD_EDGE` — connect two nodes
- `UPDATE_EDGE` — change edge type or other fields (recalculates weight when type changes)
- `DELETE_EDGE` — remove an edge
- `SPLIT_EDGE` — insert a new unlabeled node at a point along an existing edge, replacing it with two edges
- `ADD_EDGE_TYPE` — add a user-defined custom edge type
- `UPDATE_EDGE_TYPE` — edit a custom or built-in edge type's name/weight/accessibility (recalculates weight for all edges using that type)
- `DELETE_EDGE_TYPE` — remove a custom edge type (built-in types cannot be deleted); edges of that type are reassigned to `walkway`
- `CALIBRATE_SECTION` — set `Section.scale` and recalculate all length-based edge weights for that section
- `LOAD_BUILDING` — replace entire state (used for import)

### Persistence: localStorage + IndexedDB

Building state is split across two stores:
- **localStorage** (`office-navigator-state`) holds the graph structure — sections,
  nodes, edges, edge types, name — with each `Section.imageData` stripped to `''`
  before writing. This keeps the JSON small and avoids hitting localStorage's
  per-origin size quota.
- **IndexedDB** (`office-navigator-db`, object store `section-images`, in
  `src/utils/imageStore.ts`) holds the actual base64 `imageData` for each section,
  keyed by section ID.

The persistence effect in `useGraphReducer.ts` runs on every dispatch: it writes the
stripped structure to localStorage, and re-saves to IndexedDB only the sections whose
`imageData` changed since the last save (tracked via a ref) — not every section on
every dispatch. Deleting a section also deletes its IndexedDB entry.

On app initialization, structure is rehydrated from localStorage synchronously (with
`imageData` empty), then a mount effect asynchronously loads images from IndexedDB and
dispatches `LOAD_BUILDING` to merge them back in — so sections briefly render without
their image on first paint. A one-time migration reads any legacy base64 `imageData`
still embedded in an old localStorage payload and copies it into IndexedDB.

The base64-in-JSON format itself is still used for **export/import** (see "Export /
import format" below) — that's a separate, deliberate tradeoff from the localStorage
storage format described here.

---

## Canvas architecture

The annotation canvas uses a single `<canvas>` element per section view. Rendering is
immediate-mode: on every relevant state change, clear and redraw everything.

Draw order (back to front):
1. Map image (scaled to fill canvas)
2. Semi-transparent dark overlay (improves node/edge visibility over busy maps)
3. Edges — colored and dash-patterned by type
4. Edge weight labels
5. Rubber-band preview edge (editor only, drawn to current mouse position)
6. Nodes — colored by state (default / room / connector / selected / pending)
7. Node labels (with background rect for legibility)

Hit detection:
- **Nodes:** `Math.hypot(mouseX - nodeX, mouseY - nodeY) < HIT_RADIUS` (HIT_RADIUS = 12)
- **Edges:** point-to-segment distance < 6px (only needed in select mode for edge editing)
- Always check nodes before edges (nodes take priority on overlapping clicks)

### Editor interaction modes

| Mode | Cursor | Click behavior |
|------|--------|----------------|
| `select` | default | click node to select; drag to move; double-click to open label editor; click edge to open edge editor; click empty space to deselect |
| `node` | crosshair | click empty space to place node; clicking existing node does nothing |
| `edge` | cell | click source node to begin edge; click target node to complete; click empty space to cancel |
| `link` | crosshair | special mode for cross-section edges — see Cross-section connections below |
| `calibrate` | crosshair | click two points on the map to define a known real-world distance; entering the distance sets `Section.scale` via `CALIBRATE_SECTION` |

### Node-path auto-connect (desktop only)

Two toggles in the toolbar, shown only in `node` mode and only on desktop (hidden and
functionally inert on mobile/tablet — `isMobile || isTablet`):

- **Automatically create edges** — each click places a node connected by an edge (same
  type as `currentEdgeType`) to the previously-placed node, continuing a chain across
  clicks (`EditorState.lastPathNodeId` tracks the chain's current end). Clicking the
  chain's last node again cancels the chain; clicking any *other* existing node
  re-anchors the chain to it instead (the next new node connects from there); pressing
  Escape (which also exits to `select` mode) or switching tools cancels the chain
  entirely. Turning this off also turns off "Snap to axis". Clicking near an existing
  edge still splits it as normal — the split-in node becomes the chain's new last node.
- **Snap to axis** (togglable only while the above is on) — forces each new node to align
  with the previous one on whichever axis (X or Y) needs the smaller correction, rather
  than landing exactly under the cursor.

Before each click, a low-opacity preview of the pending node + connecting edge follows
the cursor (`useCanvasRenderer.ts`, reusing the `NODE_DIM_ALPHA` constant).

### Cross-section connections (link mode)

When creating an edge between nodes in different sections:
1. User clicks a connector node in `edge` mode on section A — if the target node is in a
   different section, the app enters `link` mode instead of completing the edge normally
2. A "pending cross-section link" banner appears in the toolbar showing the source node
3. The user switches sections using the section tabs
4. The user clicks the target connector node on section B to complete the edge
5. The edge is created with `crossSection: true` and a fixed weight based on edge type
6. Clicking empty space or pressing Escape cancels the pending link

Cross-section edges are not drawn on the canvas (endpoints are on different images).
They are listed in the EditorSidebar under "Cross-section connections."

---

## Navigator mode

### Room selection

The navigator supports two destination modes:

- **Room** — origin and destination are selected from searchable dropdowns (`SearchableSelect`, `src/components/shared/`) populated with all nodes where `isRoom === true`, grouped by section name.
- **Nearest in category** — destination is the closest node (by path weight) whose `category` matches the selected string. Uses `dijkstraToCategory()` in `src/utils/pathfinding.ts`.

The user's current section view updates automatically to show the origin node's section when a selection is made.

Rooms can also be picked directly on the map: clicking a room node opens a small context
menu at the click point with "Set origin" / "Set destination" options (`NavigatorCanvas.tsx`).

### Responsive layout

`NavigatorControls` (`src/components/Navigator/NavigatorControls.tsx`) renders
differently depending on viewport:

- **Desktop (>1024px):** a left sidebar containing four `CollapsibleSection` accordions —
  Route, Route options, Directions, Sections — any number of which can be open at once.
- **Mobile/tablet (≤1024px, `isMobile || isTablet`):** a collapsible tab bar along the top
  of the screen (above the map) with the same four groups as tabs. Only one tab's content
  is shown at a time; tapping the active tab again collapses it down to just the strip to
  maximize map space, tapping a different tab switches to it and expands. The "Sections"
  tab is omitted when the building has no sections yet, matching the desktop sidebar.

### Pathfinding

Dijkstra's algorithm over the full graph (all sections, all nodes). Before running:
- Filter out edges whose type is in the user's `excludedTypes` set (accessibility options)
- If no path exists after filtering, show "No accessible route found" rather than
  silently failing

The pathfinder is a pure function in `src/utils/pathfinding.ts` — no React dependencies.

### Path display

1. **Map highlight** — path edges drawn in a distinct highlight color over the map;
   path nodes drawn with a highlighted ring; non-path elements dimmed
2. **Section transitions** — when the path crosses a section boundary, the canvas
   automatically switches to display the next section at that step; a transition
   instruction is shown ("Take the stairs to Floor 2 — continue on Floor 2 East")
3. **Directions panel** (toggleable) — ordered list of waypoints extracted from the
   path: only nodes with labels or `isConnector === true` are included; unlabeled
   walkway nodes are silently skipped
4. **Auto-fit zoom** — the view automatically zooms/pans to frame the bounding box of the
   path's nodes within the currently displayed section, leaving a fixed screen-pixel
   padding on all sides (`PATH_FIT_PADDING` in `NavigatorCanvas.tsx`, via
   `fitZoomPan()` in `src/hooks/useZoomPan.ts`). Re-fits every time the displayed section
   changes while a path is active (stepping through a multi-section path, switching
   sections, or picking a new origin) — this takes priority over the per-section
   "remember my last manual zoom" cache, which still governs plain browsing when no path
   is selected. Manual zoom/pan while staying on the same path/section is left alone.

---

## Export / import format

Single JSON file. Images are embedded as base64 strings.

```json
{
  "version": 1,
  "exportedAt": "<ISO timestamp>",
  "building": {
    "sections": [...],
    "nodes": [...],
    "edges": [...]
  }
}
```

The `version` field is included for future compatibility. For MVP, only version 1 exists
and no migration logic is needed.

**Known limitation:** Base64 image embedding inflates file size by ~33%. For a building
with many floors and high-resolution map images, the export file can become large (10MB+).
This is acceptable for MVP given the personal-use context and infrequent export usage.

**Future upgrade path:** Replace base64 embedding with a zip archive (using JSZip or
similar) containing `graph.json` plus separate image files referenced by filename. This
would require changes only to `src/utils/export.ts` and the import UI — the rest of the
app is insulated from this detail.

---

## Edge type reference

### Built-in types

| Type | Color | Dash pattern | Weight | Accessible |
|------|-------|--------------|--------|------------|
| `walkway` | Blue `#378ADD` | Solid | Euclidean × scale | Yes |
| `stairs` | Coral `#D85A30` | Long dash `[12,6]` | 150 (fixed) | No |
| `elevator` | Purple `#534AB7` | Short dash `[4,4]` | 300 (fixed) | Yes |
| `ramp` | Teal `#1D9E75` | Long dash `[12,6]` | Euclidean × scale | Yes |

Accessibility filtering in the navigator excludes edge types where `isAccessible === false`
(only `stairs` among the built-ins) when the "Accessible route" option is enabled.

### Custom types

Users can create additional edge types via the sidebar. Custom types are stored in
`Building.edgeTypes` and can configure their own color, weight mode, fixed weight,
length scalar, and accessibility flag. Custom types can be deleted; built-in types cannot.
Deleting a custom type reassigns all its edges to `walkway`.

---

## Coding conventions

- TypeScript strict mode. No `any`.
- All canvas drawing logic lives in hooks or utility functions — not inline in components.
- Components are responsible for layout and event wiring only.
- Pure functions (pathfinding, geometry, export) live in `src/utils/` with no React imports.
- Prefer explicit action types in the reducer over generic `UPDATE` actions with partial
  payloads — makes the action log readable when debugging.
- All node IDs and edge IDs are generated with `generateId()` from `src/utils/id.ts` (wraps `crypto.randomUUID()`).
  Reducer actions that create a node (`ADD_NODE`, `SPLIT_EDGE`) take the id as part of the
  payload rather than generating it internally — the caller supplies it via `generateId()`
  before dispatching (matching `ADD_SECTION`), needed whenever the caller must know the
  new id synchronously (e.g. to immediately wire up a connecting edge).
- Numbers displayed to the user are always rounded — no raw floats in the UI.

---

## Known limitations and future work

- No left/right turn directions — the graph has no heading/orientation data, so waypoint
  instructions are landmark-based only ("continue to the elevator", "arrive at cafeteria")
- Base64 image export — see "Export / import format" above for upgrade path
- No multi-user support — single localStorage instance, single device
- Navigator origin defaults to first room in list — a "current location" memory feature
  would improve repeated navigation sessions
