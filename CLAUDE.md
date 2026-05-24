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
      EditorCanvas.tsx       # canvas rendering + mouse interaction
      EditorToolbar.tsx      # mode/tool/edge-type controls
      EditorSidebar.tsx      # section/floor management, cross-section connections
    Navigator/
      NavigatorCanvas.tsx    # read-only canvas with path highlight
      NavigatorControls.tsx  # origin/destination dropdowns, directions toggle
      DirectionsPanel.tsx    # toggleable waypoint instruction list
    shared/
      AppShell.tsx           # top-level layout, mode toggle
  hooks/
    useGraphReducer.ts       # useReducer for all graph state + localStorage sync
    usePathfinder.ts         # Dijkstra implementation, accessibility filtering
    useCanvasRenderer.ts     # shared canvas draw logic (editor + navigator)
  types/
    graph.ts                 # all TypeScript interfaces (canonical source of truth)
  utils/
    geometry.ts              # hit detection, euclidean distance, norm/px conversion
    export.ts                # serialize/deserialize graph bundle (base64-in-JSON)
    pathfinding.ts           # Dijkstra algorithm (pure function, no React)
```

---

## Data model

These interfaces are the canonical source of truth. Do not deviate from them without
updating this file.

```ts
type EdgeType = 'walkway' | 'stairs' | 'elevator' | 'ramp' | 'bridge';

interface Building {
  sections: Section[];
  nodes: Node[];
  edges: Edge[];
}

interface Section {
  id: string;
  name: string;         // e.g. "Floor 3 – Tower 1"
  floor: number;        // logical floor number (1, 2, 3...)
  imageData: string;    // base64-encoded image (PNG or JPG)
  imageW: number;       // natural image width in pixels
  imageH: number;       // natural image height in pixels
}

interface Node {
  id: string;
  sectionId: string;    // which Section this node was placed on
  nx: number;           // normalized x position (0.0–1.0) relative to section image
  ny: number;           // normalized y position (0.0–1.0) relative to section image
  label: string;        // display name, empty string if unlabeled
  isRoom: boolean;      // true = appears in navigator origin/destination dropdowns
  isConnector: boolean; // true = stairwell landing, elevator door, bridge entry, etc.
}

interface Edge {
  id: string;
  srcId: string;
  tgtId: string;
  type: EdgeType;
  weight: number;       // euclidean pixel distance for walkway/ramp; fixed constant for others
  crossSection: boolean; // true if src and tgt belong to different sections
}
```

### Fixed edge weights (constants, defined in `src/utils/pathfinding.ts`)

```ts
const FIXED_WEIGHTS: Partial<Record<EdgeType, number>> = {
  stairs:   150,
  elevator: 300,
  bridge:   100,
};
// walkway and ramp weights are computed as euclidean pixel distance at creation time
// and updated live when nodes are dragged
```

### Coordinate system

All node positions are stored as normalized fractions (0.0–1.0) of their section image's
natural dimensions. Convert to canvas pixels for rendering by multiplying by the canvas's
displayed width/height. This ensures graph overlays correctly regardless of how the image
is displayed.

---

## Graph state — useReducer

All mutations to Building state go through the reducer. No direct state mutation elsewhere.

Action types:
- `ADD_SECTION` — add a new section (floor + image)
- `UPDATE_SECTION_IMAGE` — set/replace the image for a section
- `ADD_NODE` — place a node on a section
- `UPDATE_NODE` — update label, isRoom, isConnector, or position
- `DELETE_NODE` — remove node and all its edges
- `ADD_EDGE` — connect two nodes
- `UPDATE_EDGE` — change edge type (recalculates weight if changing to/from fixed type)
- `DELETE_EDGE` — remove an edge
- `LOAD_BUILDING` — replace entire state (used for import)

### localStorage sync

On every dispatch, serialize the full Building state to localStorage under the key
`office-navigator-state`. On app initialization, attempt to rehydrate from localStorage
before falling back to an empty Building. Images are stored as base64 strings — this is
intentional and acceptable given the use case (see "Known limitations" below).

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

Origin and destination are selected from dropdown menus populated with all nodes where
`isRoom === true`, grouped by section name. The user's current section view updates
automatically to show the origin node's section when a selection is made.

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

| Type | Color | Dash pattern | Weight | Notes |
|------|-------|--------------|--------|-------|
| `walkway` | Blue `#378ADD` | Solid | Euclidean | Default type |
| `stairs` | Coral `#D85A30` | Long dash | 150 (fixed) | Not accessible |
| `elevator` | Purple `#534AB7` | Short dash | 300 (fixed) | Accessible |
| `ramp` | Teal `#1D9E75` | Long dash | Euclidean | Accessible |
| `bridge` | Amber `#EF9F27` | Dot-dash | 100 (fixed) | Cross-section |

Accessibility filtering in the navigator excludes `stairs` by default when the
"Accessible route" option is enabled. `elevator`, `ramp`, and `bridge` are always
included in accessible routes.

---

## Coding conventions

- TypeScript strict mode. No `any`.
- All canvas drawing logic lives in hooks or utility functions — not inline in components.
- Components are responsible for layout and event wiring only.
- Pure functions (pathfinding, geometry, export) live in `src/utils/` with no React imports.
- Prefer explicit action types in the reducer over generic `UPDATE` actions with partial
  payloads — makes the action log readable when debugging.
- All node IDs and edge IDs are generated with `crypto.randomUUID()`.
- Numbers displayed to the user are always rounded — no raw floats in the UI.

---

## Known limitations and future work

- No left/right turn directions — the graph has no heading/orientation data, so waypoint
  instructions are landmark-based only ("continue to the elevator", "arrive at cafeteria")
- Base64 image export — see "Export / import format" above for upgrade path
- No multi-user support — single localStorage instance, single device
- Navigator origin defaults to first room in list — a "current location" memory feature
  would improve repeated navigation sessions
- Map-click selection in the navigator (as an alternative to dropdowns) is not implemented
  in MVP but is a natural future addition
