# IMPLEMENTATION_PLAN.md — Office Navigator

Phased implementation plan for Claude Code. Read CLAUDE.md first — this document
assumes familiarity with the architecture, data model, and design decisions documented
there.

Work through phases in order. Each phase produces working, runnable software — do not
move to the next phase until the current one is complete and manually testable.

---

## Phase 1 — Project scaffolding and data model

**Goal:** A running Vite + React + TypeScript app with the full type system in place and
an empty building state rendering correctly.

### Tasks

1. Scaffold the project with `npm create vite@latest office-navigator -- --template react-ts`
2. Delete all boilerplate content (App.css, default App.tsx content, etc.)
3. Create `src/types/graph.ts` with all interfaces exactly as specified in CLAUDE.md:
   `EdgeType`, `Building`, `Section`, `Node`, `Edge`
4. Create `src/utils/pathfinding.ts` with the `FIXED_WEIGHTS` constants and a stub
   `dijkstra()` function (implement in Phase 4)
5. Create `src/utils/geometry.ts` with:
   - `norm2px(nx, ny, canvasW, canvasH): {x, y}` — convert normalized coords to pixels
   - `px2norm(px, py, canvasW, canvasH): {x, y}` — convert pixels to normalized coords
   - `euclideanWeight(a: Node, b: Node, canvasW: number, canvasH: number): number`
   - `hitTestNode(mouseX, mouseY, node: Node, canvasW, canvasH): boolean` — uses HIT_RADIUS = 12
   - `distanceToSegment(px, py, x1, y1, x2, y2): number` — for edge hit detection
6. Create `src/hooks/useGraphReducer.ts`:
   - Define all action types from CLAUDE.md
   - Implement the reducer with empty/stub handlers for each action
   - Initialize from localStorage if available, otherwise use empty Building state
   - On every dispatch, serialize state to localStorage
7. Create `src/components/shared/AppShell.tsx` with:
   - A top bar with the app name and a mode toggle (Editor / Navigator)
   - Mode state managed with `useState`
   - Renders placeholder `<div>` for each mode
8. Wire everything into `src/main.tsx` and `src/App.tsx`

### Acceptance criteria

- App runs with `npm run dev` without errors
- AppShell renders with mode toggle that switches between "Editor" and "Navigator" placeholders
- useGraphReducer initializes without errors (empty building if no localStorage data)
- TypeScript compiles with no errors (`npm run build`)

---

## Phase 2 — Editor: single-section canvas annotation

**Goal:** A fully working editor for a single section — upload an image, place nodes,
draw edges, label rooms. No multi-section or cross-section support yet.

### Tasks

1. Create `src/hooks/useCanvasRenderer.ts`:
   - Accepts: canvas ref, Building state, current section ID, editor state (selected node,
     pending edge source, mouse position, mode)
   - Implements the draw order from CLAUDE.md: image → overlay → edges → edge labels →
     rubber-band preview → nodes → node labels
   - Edge colors and dash patterns per the edge type reference table in CLAUDE.md
   - Node colors: default blue, room green, connector amber, selected purple, pending-source orange
   - Node labels rendered with a background rect for legibility over map images
   - Returns a `redraw()` function that components can call

2. Create `src/components/Editor/EditorCanvas.tsx`:
   - Renders a `<canvas>` element sized to fill its container width; height proportional
     to the section image aspect ratio (square canvas if no image loaded)
   - Attaches mouse event handlers: `mousedown`, `mousemove`, `mouseup`, `dblclick`
   - Translates mouse events to canvas-relative coordinates
   - Implements the four interaction modes (`select`, `node`, `edge`, `link`) exactly as
     specified in CLAUDE.md
   - On `select` mode double-click: opens an inline label editor (a small absolutely-
     positioned form with a text input and "is room" / "is connector" checkboxes)
   - On `select` mode edge click: opens an inline edge type selector
   - Calls `redraw()` after every state change
   - Shows a "Upload a map image to begin" placeholder when no image is loaded

3. Implement all reducer action handlers in `useGraphReducer.ts`:
   - `ADD_NODE`, `UPDATE_NODE`, `DELETE_NODE`
   - `ADD_EDGE`, `UPDATE_EDGE`, `DELETE_EDGE`
   - When a node is deleted, also delete all edges connected to it
   - When a node is moved (UPDATE_NODE with new nx/ny), recalculate weights for all
     connected walkway and ramp edges

4. Create `src/components/Editor/EditorToolbar.tsx`:
   - Mode buttons: Select, Add node, Add edge (icon + label each)
   - Edge type selector: Walkway, Stairs, Elevator, Ramp, Bridge (pill buttons)
   - Shows fixed weight hint next to edge type selector ("Fixed: 150" or "Euclidean")
   - Delete button (deletes selected node or edge)
   - Upload map button (triggers hidden file input)
   - Export JSON button (calls export utility, triggers download)
   - Pending cross-section link banner (hidden unless in `link` mode — shows source node
     label and an Escape/cancel button)

5. Create `src/utils/export.ts`:
   - `exportBuilding(building: Building): void` — serializes to JSON and triggers browser
     download of `office-navigator.json`
   - `importBuilding(file: File): Promise<Building>` — reads JSON file and returns parsed
     Building (validate `version` field exists)

6. Wire EditorCanvas and EditorToolbar together in a parent `Editor.tsx` component,
   connected to `useGraphReducer`

### Acceptance criteria

- Can upload a map image and see it rendered on the canvas
- Can place nodes on the image by clicking in node mode
- Can draw walkway edges between nodes; edge renders with correct color and weight label
- Can draw stairs/elevator/ramp edges with correct fixed weights and dash patterns
- Can select a node in select mode; selected node renders in purple
- Can drag a selected node; connected walkway edge weights update live
- Can double-click a node to open the label editor; label appears on canvas after saving
- Can mark a node as a room or connector via the label editor
- Can click an edge in select mode to change its type or delete it
- Can delete a selected node (and its edges) via the Delete button
- Export button produces a valid JSON file with the correct structure
- State persists in localStorage — refreshing the page restores the graph

---

## Phase 3 — Editor: multi-section and cross-section connections

**Goal:** Support multiple sections (floors and towers), with cross-section edges
connecting them.

### Tasks

1. Create `src/components/Editor/EditorSidebar.tsx`:
   - Section list — each section shown as a tab/row with its name and floor number
   - "Add section" button — opens a small form to enter section name and floor number,
     then immediately prompts for an image upload
   - Active section is highlighted; clicking a section switches the canvas to that section
   - "Cross-section connections" panel at the bottom of the sidebar:
     - Lists all edges where `crossSection === true`
     - Each entry shows: source node label (section name) → edge type → target node label
       (section name), with a delete button
     - This is the only place cross-section edges are visible since they can't be drawn
       on a single-section canvas

2. Implement `ADD_SECTION` and `UPDATE_SECTION_IMAGE` reducer actions

3. Implement cross-section link mode in `EditorCanvas.tsx`:
   - When in `edge` mode and the user clicks a node that is `isConnector: true`, check
     if the intended target would be in a different section
   - If the user then clicks a node in a different section (after switching via the
     sidebar), complete the cross-section edge with `crossSection: true` and the
     appropriate fixed weight
   - While a cross-section link is pending, the toolbar banner shows: "Linking from
     [node label] on [section name] — switch to target section and click the destination
     connector node. Press Escape to cancel."
   - Pressing Escape or clicking the cancel button in the banner clears the pending link

4. Update `useCanvasRenderer.ts` to:
   - Only render nodes and edges belonging to the currently active section
   - Render cross-section edges as a special indicator on their visible endpoint node
     (e.g. a small ring or second outline around the node) so the user knows a
     cross-section connection exists there

5. Update `EditorToolbar.tsx` to show the current section name

### Acceptance criteria

- Can add multiple sections, each with its own image
- Switching sections switches the canvas to the correct image and node set
- Can mark a node as a connector
- Can initiate a cross-section link from a connector node, switch sections, and complete
  the link by clicking a connector node on the new section
- Pending link banner is visible and cancellable
- Cross-section edges appear in the EditorSidebar connections panel
- Connector nodes with cross-section edges show a visual indicator on the canvas
- Export produces a JSON that correctly includes all sections, nodes, and cross-section edges

---

## Phase 4 — Pathfinding

**Goal:** A working Dijkstra implementation that finds the shortest path through the
full graph, respecting accessibility filters.

### Tasks

1. Implement `dijkstra()` in `src/utils/pathfinding.ts`:

   ```ts
   function dijkstra(
     nodes: Node[],
     edges: Edge[],
     srcId: string,
     tgtId: string,
     excludedTypes: Set<EdgeType>,
   ): string[] | null
   // Returns ordered array of node IDs representing the path, or null if no path exists
   ```

   - Use a simple priority queue (min-heap or sorted array — either is fine at office-map
     scale)
   - Filter out edges in `excludedTypes` before running
   - The graph is undirected — each edge can be traversed in either direction
   - Return `null` if target is unreachable (no path, or all paths use excluded types)

2. Create `src/hooks/usePathfinder.ts`:
   - Accepts: building state, srcId, tgtId, excludedTypes
   - Returns: `{ path: string[] | null, isLoading: boolean, error: string | null }`
   - Calls `dijkstra()` when inputs change
   - Sets error to "No accessible route found" when result is null and excludedTypes
     is non-empty, or "No route found" otherwise

3. Write unit tests for `dijkstra()` in `src/utils/pathfinding.test.ts`:
   - Simple linear path A→B→C finds correct route
   - Chooses lower-weight path when two routes exist
   - Returns null when no path exists
   - Returns null when only path uses an excluded edge type
   - Handles cross-section edges correctly (they're just edges with higher fixed weights)

### Acceptance criteria

- All unit tests pass
- `dijkstra()` correctly finds shortest paths in a manually constructed test graph
- Excluded edge types cause the pathfinder to route around them or return null

---

## Phase 5 — Navigator mode

**Goal:** A working navigator that lets the user select origin and destination, runs
pathfinding, and displays the result as a highlighted path on the map with optional
waypoint directions.

### Tasks

1. Create `src/components/Navigator/NavigatorControls.tsx`:
   - "From" dropdown — lists all nodes where `isRoom === true`, grouped by section name
   - "To" dropdown — same list, excludes currently selected origin
   - "Accessible route" toggle — when enabled, adds `stairs` to `excludedTypes`
   - "Show directions" toggle — shows/hides the DirectionsPanel
   - "Find path" button (or auto-find on selection change — either is fine)
   - Displays "No route found" or "No accessible route found" error inline when applicable

2. Create `src/components/Navigator/NavigatorCanvas.tsx`:
   - Read-only canvas (no editing interaction)
   - Renders the current section's map image and full graph (dimmed)
   - When a path is active:
     - Path edges rendered in highlight color (bright amber `#EF9F27`), full opacity
     - Path nodes rendered with a highlight ring
     - Non-path edges and nodes rendered at reduced opacity (0.25)
   - When the path crosses a section boundary, the canvas displays the section containing
     the node currently being "stepped through" — use a simple step indicator or
     auto-advance to show the full path across all sections
   - Connector/transition nodes on the path are labeled inline with their transition type
     ("Take stairs", "Take elevator", etc.)

3. Create `src/components/Navigator/DirectionsPanel.tsx`:
   - Toggleable panel (controlled by NavigatorControls)
   - Extracts waypoints from the path: only nodes where `label !== ''` or
     `isConnector === true`
   - Renders as a numbered list
   - First item always: "Start at [origin label]"
   - Last item always: "Arrive at [destination label]"
   - Connector nodes render as: "Take the [edge type] to [section name]" at section
     transitions, or "Pass through [label]" for labeled intermediate nodes
   - Unlabeled, non-connector walkway nodes are silently omitted

4. Wire Navigator components together in `src/components/Navigator/Navigator.tsx`,
   connected to `useGraphReducer` (read-only) and `usePathfinder`

5. When the path spans multiple sections, add a simple section step indicator to
   NavigatorCanvas (e.g. "Viewing: Floor 1 → Floor 2" with prev/next arrows to step
   through sections manually if the user wants to preview each floor)

### Acceptance criteria

- Origin and destination dropdowns show all rooms, grouped by section
- Selecting origin and destination finds and displays the path
- Path is visually distinct from the rest of the graph on the canvas
- Non-path elements are dimmed
- Accessible route toggle excludes stairs and finds an alternative path (or shows error)
- Directions panel shows a correct ordered waypoint list
- Directions panel can be toggled on and off
- Multi-section paths show the correct section canvas at each transition
- "No route found" error displays correctly when applicable

---

## Phase 6 — Polish and edge cases

**Goal:** Handle rough edges, improve UX, and make the app genuinely pleasant to use
day-to-day.

### Tasks

1. **Keyboard shortcuts:**
   - `S` — switch to Select mode
   - `N` — switch to Node mode
   - `E` — switch to Edge mode
   - `Delete` / `Backspace` — delete selected node or edge
   - `Escape` — cancel pending edge or cross-section link; deselect
   - `1`–`5` — switch edge type (1=walkway, 2=stairs, 3=elevator, 4=ramp, 5=bridge)

2. **Import:** Add an Import button to the toolbar that accepts a JSON file and calls
   `importBuilding()`, dispatching `LOAD_BUILDING` to replace state. Show a confirmation
   prompt before overwriting existing work.

3. **Undo:** Add a simple undo stack to `useGraphReducer` — store the last 20 Building
   states, pop on `Ctrl+Z`. This is especially useful during annotation sessions.

4. **Section renaming:** Allow double-clicking a section name in the sidebar to rename it.

5. **Empty state guidance:** When the app loads with no data, show a brief onboarding
   message in the Editor canvas area explaining the workflow (upload image → place nodes
   → draw edges → label rooms → navigate).

6. **Navigator default section:** When a path is found, the navigator canvas defaults to
   showing the section containing the origin node.

7. **Error boundaries:** Wrap major components in React error boundaries so a rendering
   error in the canvas doesn't crash the whole app.

8. **Mobile considerations:** The navigator is likely to be used on a phone. Ensure:
   - Touch events are handled on the navigator canvas (for panning/viewing, not editing)
   - Dropdowns and toggle buttons are large enough to tap comfortably
   - DirectionsPanel is readable at mobile font sizes

### Acceptance criteria

- All keyboard shortcuts work correctly
- Import correctly replaces state with confirmation prompt
- Undo rolls back the last action
- App is usable on a mobile browser in navigator mode

---

## Implementation notes for Claude Code

- **Work iteratively within each phase.** Get the simplest version working before adding
  complexity. For example, in Phase 2, get node placement and rendering working before
  implementing edge drawing.

- **Test manually after each significant piece.** The acceptance criteria are your
  checkpoints — verify each one before moving on.

- **Don't add dependencies without a clear reason.** The stack is intentionally minimal.
  If you find yourself reaching for a library, check whether a 10-line utility function
  would do the job.

- **Keep canvas drawing logic out of components.** All draw calls belong in
  `useCanvasRenderer.ts`. Components wire events and call `redraw()` — they don't touch
  the canvas context directly.

- **The graph is undirected.** Every edge can be traversed in both directions. Don't
  store duplicate edges — handle directionality in the pathfinder by checking both
  `srcId` and `tgtId` when building the adjacency list.

- **localStorage can fail** (private browsing, storage quota exceeded). Wrap all
  localStorage access in try/catch and fail silently — the app should work fine without
  persistence, just without auto-save.

- **Don't implement features from later phases early.** If you notice something from
  Phase 6 would be easy to add during Phase 2, make a note in a comment but don't
  implement it. Scope creep during early phases delays getting a working baseline.
