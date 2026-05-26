# Office Navigator — User Manual

---

## Overview

Office Navigator is a two-mode app for annotating floor maps with a walkable graph, then finding shortest paths between named rooms.

- **Editor mode** — upload map images, place nodes, draw edges, label rooms
- **Navigator mode** — select origin and destination, view the shortest path with directions

Switch between modes using the **Editor / Navigator** buttons in the top bar. Your work is automatically saved to the browser and restored on next load.

---

## Editor Mode

### Setting up sections

A **section** is one floor or area of your building, each with its own map image.

1. In the left sidebar, click **+ New Section**
2. Enter a name (e.g. "Floor 2") and floor number
3. Click **Choose image or PDF…** and select your map file
4. Click **Add** — the section appears in the list and its map loads on the canvas

**Multi-page PDFs:** If you select a PDF with multiple pages, you'll be asked whether to import all pages as separate sections automatically.

**To rename a section:** Click the **✎** icon next to its name in the sidebar and press Enter to save.

**To replace a section's map image:** Select the section, then click **Replace Image** in the toolbar.

### Placing nodes

Nodes represent locations — hallway junctions, room entrances, stairwells, etc.

1. Click **Add Node** in the toolbar (or press `N`)
2. Click anywhere on the map to place a node

**Splitting an edge:** In Add Node mode, clicking directly on an existing edge inserts a new node at that point and splits the edge into two.

### Drawing edges

Edges represent connections between nodes — corridors, stairs, elevators, etc.

1. Click **Add Edge** in the toolbar (or press `E`)
2. Choose an edge type from the toolbar (or press `1`–`5`):
   - **Walkway** — standard corridor, weight is pixel distance
   - **Stairs** — fixed weight 150, not accessible
   - **Elevator** — fixed weight 300, accessible
   - **Ramp** — like a walkway but accessible
   - **Bridge** — fixed weight 100, for cross-section connections
3. Click a source node, then click a destination node to draw the edge
4. Click empty space to cancel

The weight label (routing cost) is shown on each edge.

### Labeling nodes

Double-click any node in **Select** mode to open the label editor:

- **Label** — the room's display name (e.g. "Room 204", "Cafeteria")
- **Is room** — check this to make the room selectable in Navigator's origin/destination dropdowns
- **Is connector** — check this for stairwell landings, elevator doors, and bridge endpoints; required for cross-section links

### Selecting and editing

Switch to **Select** mode (toolbar button or `S`):

- **Click a node** — selects it (turns purple)
- **Drag a selected node** — moves it; connected edge weights update automatically
- **Double-click a node** — opens the label editor
- **Click an edge** — opens the edge type editor (change type or delete)
- **Click empty space** — deselects everything

Press `Delete` or `Backspace` to delete the selected node or edge. Deleting a node also removes all its edges.

### Cross-section connections

To connect a node on Floor 1 to a node on Floor 2 (via stairs, elevator, etc.):

1. Both nodes must be marked **Is connector**
2. In **Add Edge** mode, click the connector node on section A — the pending edge source is set (node turns orange)
3. Switch to section B using the sidebar — the app automatically enters **Link** mode and shows a banner at the top of the toolbar
4. Click the connector node on section B to complete the link
5. Click **Cancel** in the banner or press `Escape` to abort

Cross-section links appear in the **Cross-section links** panel at the bottom of the sidebar and can be deleted there.

### Undo

Press `Ctrl+Z` (Windows/Linux) or `Cmd+Z` (Mac) to undo the last action. Up to 20 steps are stored.

### Export and Import

- **Export JSON** — downloads your entire building (map images, nodes, edges) as a single `.json` file
- **Import JSON** — loads a previously exported file, replacing the current data (you'll be asked to confirm)

---

## Navigator Mode

### Finding a path

1. Select an **origin** from the **From** dropdown (only rooms are listed)
2. Select a **destination** from the **To** dropdown
3. The shortest path is found and highlighted on the map automatically

If no path exists, an error message appears below the dropdowns.

### Accessible route

Check **Accessible route (no stairs)** to exclude stairs from the search. If the only path uses stairs, you'll see "No accessible route found."

### Reading the map

- **Amber edges** — the path you should follow
- **Amber rings** around nodes — stops along the path
- **Dimmed edges and nodes** — not on the path

### Multi-floor paths

When a path crosses sections, a step bar appears above the map:

```
← Prev    Floor 2  (2/3)    Next →
```

Use **← Prev** and **Next →** to step through each floor of the path.

### Directions panel

Check **Show directions** to open a numbered step list:

- **Start at** / **Arrive at** — origin and destination (shown in amber)
- **Take the Elevator to Floor 2** — section transitions (shown in purple)
- **Continue to Room 204** — labeled intermediate stops
- Unlabeled corridor nodes are silently skipped

### Navigating the map

Pan and zoom work the same in both modes:

| Action | Result |
|---|---|
| Scroll wheel | Zoom in / out centered on cursor |
| Middle-click + drag | Pan |
| Space + drag | Pan |
| `+` / `−` buttons | Zoom in / out |
| **Reset** button | Return to 100% zoom |
| Pinch (touchscreen) | Zoom |
| Single-finger drag (touchscreen) | Pan |

Zoom level is saved per section — switching sections restores where you left off.

---

## Quick reference

| Key | Action |
|---|---|
| `S` | Select mode |
| `N` | Add Node mode |
| `E` | Add Edge mode |
| `1` – `5` | Switch edge type (Walkway / Stairs / Elevator / Ramp / Bridge) |
| `Delete` / `Backspace` | Delete selected node or edge |
| `Escape` | Cancel pending edge or link; deselect |
| `Ctrl+Z` / `Cmd+Z` | Undo |
