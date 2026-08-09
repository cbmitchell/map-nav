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
2. Enter a name (e.g. "Floor 2"), floor number, and an optional **Building** name
3. Click **Choose image or PDF…** and select your map file
4. Click **Add** — the section appears in the list and its map loads on the canvas

Sections are grouped and displayed under building-name headers in the sidebar. Leaving
Building blank groups the section under "(No building)". The Building field autocompletes
from names you've already used.

**Multi-page PDFs:** If you select a PDF with multiple pages, you'll be asked whether to
import all pages as separate sections automatically. Imported pages are named
"*Name* – Page *N*" with incrementing floor numbers.

**To rename a section:** Click the **✎** icon next to its name in the sidebar and press Enter to save.

**To replace a section's map image:** Click the **✎** icon next to its name in the sidebar and choose a new file in the edit form.

### Placing nodes

Nodes represent locations — hallway junctions, room entrances, stairwells, etc.

1. Click **Add Node** in the toolbar (or press `N`)
2. Click anywhere on the map to place a node

**Splitting an edge:** In Add Node mode, clicking directly on an existing edge inserts a new node at that point and splits the edge into two.

**Auto-connect (desktop only):** While in Add Node mode, two toggles appear in the
toolbar:
- **Automatically create edges** — each node you place is automatically connected by an
  edge to the previously-placed node, letting you click out a connected path. Clicking
  the chain's last node again cancels the chain; clicking a different existing node
  re-anchors the chain there.
- **Snap to axis** (only usable with the above on) — aligns each new node to the
  previous one on whichever axis needs the smaller correction, instead of landing exactly
  under the cursor.

### Drawing edges

Edges represent connections between nodes — corridors, stairs, elevators, etc.

1. Click **Add Edge** in the toolbar (or press `E`)
2. Choose an edge type from the toolbar (or press a number key — one per selectable
   type; `1`–`4` for the built-ins below, more if you've added custom types):
   - **Walkway** — standard corridor, weight is pixel distance
   - **Stairs** — fixed weight 150, not accessible
   - **Elevator** — fixed weight 300, accessible
   - **Ramp** — like a walkway but accessible
3. Click a source node, then click a destination node to draw the edge
4. Click empty space to cancel

The weight label (routing cost) is shown on each edge.

**Room Entrance** is a special edge type you'll never pick directly — the editor
auto-assigns it whenever an edge touches a room marker node (see "Room marker" below).
It's excluded from the type picker and the number-key shortcuts, and always weighs 0.

### Labeling nodes

Double-click any node in **Select** mode to open the label editor:

- **Label** — the room's display name (e.g. "Room 204", "Cafeteria")
- **Is room** — check this to make the room selectable in Navigator's origin/destination dropdowns. Checking it reveals three more fields:
  - **Category** — optional grouping (e.g. "Restroom", "Printer") used by Navigator's "Nearest in category" routing; autocompletes from categories you've already used
  - **Aliases** — optional comma-separated alternate names the room can also be searched by in Navigator
  - **Room marker** — see below
- **Is connector** — check this for stairwell landings and elevator doors; required for cross-section links

**Room marker:** for a room with multiple doors, check **Room marker** on the room node
itself (not the doors). This takes effect immediately, not on Save. If the node already
has edges connected to it, you'll be asked to confirm — the dialog tells you exactly how
many edges will convert to Room Entrance edges (edges to non-room nodes, i.e. its doors)
versus be deleted (edges to other rooms). The marker node itself is then removed from the
pathfinding graph; instead, connect its doors to it with ordinary edges and they become
its entrances automatically. If a marker ends up with no entrances, a warning appears in
its label popup — it can't be routed to until it has at least one. Unchecking Room marker
reverts its entrance edges back to Walkway, no confirmation needed.

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

The link uses whichever edge type is currently selected in the toolbar at the moment you
complete it. Unlike same-section edges, its weight isn't based on real pixel distance —
it's fixed at 100 (or the type's own fixed weight, for fixed-weight types like Stairs or
Elevator).

Cross-section links appear in the **Cross-section links** panel at the bottom of the sidebar and can be deleted there.

### Calibrating a section

Edge weight for Walkway/Ramp edges is based on pixel distance × your map's real-world
scale. To set that scale for a section:

1. Click **Calibrate** in the toolbar (no keyboard shortcut) — a badge next to the mode
   buttons shows whether the current section is calibrated
2. Click two points on the map a known real-world distance apart
3. Enter that distance in the popup and click **Apply**
4. Click **Cancel** or press `Escape` at any point to abort

Sections left uncalibrated are treated as a scale of 1.0.

### Managing edge types

The sidebar's **Edge Types** panel lists every edge type — built-in and custom — with
its color, weight, and accessibility. Click **+ Add Edge Type** to create a custom type
(name, color, weight mode — length-based or fixed — and an accessible/not-accessible
flag). Click the **✎** on any type, including built-ins, to edit its name, weight, or
accessibility. Custom types can be deleted (**×**); built-in types cannot — deleting a
custom type reassigns its edges to Walkway.

### Undo

Press `Ctrl+Z` (Windows/Linux) or `Cmd+Z` (Mac) to undo the last action. Up to 10 steps are stored.

### Export and Import

- **Export** — downloads your entire building (map images, nodes, edges) as a single `.json` file
- **Import** — loads a previously exported file, replacing the current data (you'll be asked to confirm)

---

## Navigator Mode

### Finding a path

1. Select an **origin** from the **From** dropdown — a searchable list of rooms, grouped
   by section, with your favorited rooms in a **★ Favorites** group at the top
2. Select a **destination** from the **To** dropdown the same way — or click **Nearest
   in category** next to it to instead pick a category (e.g. "Restroom") and route to
   the closest matching room
3. The shortest path is found and highlighted on the map automatically

If no path exists, an error message appears below the dropdowns.

**Picking rooms on the map:** clicking a room node opens a small menu (a bottom sheet on
mobile/tablet) with **Set origin**, **Set destination**, and a favorite (★/☆) toggle.

**Multi-entrance rooms:** a room with several doors shows as a single dot while browsing.
Once you route to (or from) it, whichever entrance the route actually uses takes on that
room's label and highlighting for the duration of the route.

### Route options

The **Route options** panel lists a checkbox per edge type (built-in and any custom
types) — check one to exclude that type from the route search, e.g. to avoid stairs. If
no path exists after excluding the checked types, you'll see "No accessible route found."

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
- **Take the Elevator to Floor 2 East** — section transitions, naming the actual edge
  type and section (shown in purple)
- **Continue to Room 204** — labeled intermediate stops
- **Pass through connector** — an unlabeled connector node (e.g. an unlabeled stairwell
  landing) still gets its own step
- Unlabeled, non-connector nodes are silently skipped

### Navigating the map

| Action | Result |
|---|---|
| Scroll wheel | Zoom in / out centered on cursor |
| Click + drag | Pan (Navigator only — in Editor, left-click is used for placing/selecting/dragging, so use middle-click or Space instead) |
| Middle-click + drag | Pan |
| Space + drag | Pan |
| Pinch (touchscreen) | Zoom |
| Single-finger drag (touchscreen) | Pan |

The Editor toolbar additionally has `+` / `−` buttons and a **Reset** button (return to
100% zoom); Navigator has no equivalent buttons.

Zoom level is saved per section — switching sections restores where you left off. While a
path is shown, though, the view instead auto-fits to frame the current step's route,
overriding the remembered zoom until you clear the route or start browsing without one.

### Mobile and tablet layout

On screens ≤1024px wide, the Route / Route options / Directions panels (plus Categories
and Sections, when applicable) appear as a tab bar above the map instead of an
always-visible sidebar. Tap a tab to expand it; tap the active tab again to collapse it
back down and free up map space.

---

## Quick reference

| Key | Action |
|---|---|
| `S` | Select mode |
| `N` | Add Node mode |
| `E` | Add Edge mode |
| `1`, `2`, `3`, … | Switch edge type — one digit per selectable type (Walkway / Stairs / Elevator / Ramp by default, more with custom types) |
| `Delete` / `Backspace` | Delete selected node or edge |
| `Escape` | Cancel pending edge or link; deselect |
| `Ctrl+Z` / `Cmd+Z` | Undo |
