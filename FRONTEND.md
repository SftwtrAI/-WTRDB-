# wtrdb Frontend: The Bridge

## A 3D-First Interface for Knowledge Graph Operations

**Version 1.0 | April 2026**
**Author: Sftwtrs.AI Private Limited**

---

## Design Philosophy

The traditional SaaS dashboard is a grid of cards on a flat page. It works. It is also forgettable. Nobody has ever shown a friend their Jira board because it looked incredible.

This interface is different. The entire application lives inside a single, continuous 3D environment. There are no "pages" in the traditional sense. There are locations within a space. The user's knowledge graphs are literal objects floating in that space. Navigation is movement. Data is architecture. The UI panels that display information, controls, and forms are holographic overlays that materialize when needed and dissolve when dismissed.

The aesthetic descends from two lineages. From Warframe: the angular, beveled holographic panels that float in the Orbiter, the way menus unfold rather than appear, the metallic sheen on UI chrome, the particle systems that make every interaction feel physical. From Star Trek: the LCARS color blocking, the sensor array geometries, the idea that technology should look like it was designed by people who care about beauty as much as function.

The critical difference from a game UI: this is a productivity tool. Every visual choice serves legibility, discoverability, and efficiency. The 3D environment is not decoration. It is the information architecture. The position, size, color, and geometry of every object in the scene communicates data. The ambient audio reinforces that data through a second sensory channel. The holographic panels present controls with the same clarity as any well-designed 2D interface, but within a spatial context that makes relationships between data visible in ways that flat layouts cannot achieve.

---

## Part I: The Scene

### 1.1 The Void

The application opens into The Void: a dark, vast 3D space rendered by Three.js (WebGL 2.0). This is not a skybox with a starfield wallpaper. It is a procedurally generated environment with depth, motion, and atmosphere.

**Background layers (back to front):**

1. **Deep field** (z = -2000 to -500): A slowly rotating nebula cloud rendered as a volumetric noise texture on a large sphere. Colors shift across the brand gradient (`#07A288` → `#5BBE4E` → `#B8E52B`) at extreme desaturation (10-15% saturation), creating a faint, warm glow in the distance. The nebula rotates at 0.0001 rad/frame. It is always present but never attention-grabbing.

2. **Star field** (z = -500 to -100): 3,000 point particles (BufferGeometry with PointsMaterial, size attenuation enabled). Each star has a random brightness between 0.3 and 1.0, and a subtle twinkle animation (sinusoidal opacity modulation at a unique frequency between 0.01 and 0.05 Hz, seeded from particle index). Stars are distributed in a spherical shell so they surround the camera, creating parallax when the camera orbits.

3. **Dust motes** (z = -100 to +100): 500 larger, softer particles drifting slowly through the scene. These use a soft circular texture with additive blending, colored `#07A288` at 8% opacity. They drift at 0.02 units/frame in random directions, wrapping at boundaries. They create a sense of atmosphere and scale, similar to dust in a sunbeam.

4. **Grid plane** (y = -50): A holographic ground reference rendered as a wireframe grid (200x200 units, 2-unit spacing). Material: `MeshBasicMaterial` with `#243645` color at 15% opacity, additive blending. The grid fades to transparent at its edges (distance-based alpha falloff). It provides spatial grounding without creating a "floor."

**Lighting rig:**

- **Key light:** DirectionalLight, `#E7EEF6`, intensity 0.8, position (50, 80, 50). Slow sinusoidal drift on x-axis (±5 units, period 120 seconds) creating gentle shadow movement
- **Fill light:** DirectionalLight, `#07A288`, intensity 0.3, position (-30, 40, -20). Teal fill gives objects their brand-colored edge lighting
- **Rim light:** DirectionalLight, `#B8E52B`, intensity 0.15, position (0, -20, -60). Lime accent on undersides, visible mainly on wireframe geometries
- **Ambient:** AmbientLight, `#16212B`, intensity 0.4. Prevents pure black shadows

**Post-processing stack (EffectComposer):**

1. RenderPass (standard scene render)
2. UnrealBloomPass (strength 0.4, radius 0.6, threshold 0.85). Bloom makes emissive wireframes glow without washing out the UI panels
3. Custom film grain pass (very subtle, 2% intensity, animated). Adds analog warmth
4. Vignette (soft, 15% darkening at edges). Focuses attention toward center

**Camera:**

PerspectiveCamera, FOV 60, near 0.1, far 5000. Orbit controls (damping 0.08, slow auto-rotate at 0.0005 rad/frame when idle for >30 seconds, stops on any input). The camera never clips through objects (minimum distance enforcement). Smooth transitions between locations use a custom tween (cubic-bezier easing, 800ms duration) that interpolates both position and lookAt target.

**Performance targets:**

- 60 FPS on discrete GPU (GTX 1060 / M1 equivalent)
- 30 FPS on integrated GPU with automatic quality reduction (halve particle counts, disable bloom, reduce grid resolution)
- Quality detection on first load: run a 1-second benchmark, select quality preset (High / Medium / Low)

---

### 1.2 Locations Within The Void

The Void contains distinct spatial regions. Navigation between regions is camera movement, not page transitions. The URL updates to reflect the current location (for shareability and browser back/forward), but the 3D scene is continuous.

```
The Void
├── The Constellation (center, y=0)         /app/constellation
│   ├── Star Detail (zoom into any star)    /app/knowledge-graph/:id
│   │   ├── Theatre (same position, mode)   /app/knowledge-graph/:id/theatre  
│   │   ├── Schema (panel overlay)          /app/knowledge-graph/:id/schema
│   │   └── Ghosts (overlay toggle)         /app/knowledge-graph/:id/ghosts
├── The Cartographer (x=-200, y=0)          /app/cartographer
├── The Observatory (x=0, y=+150)           /app/eval-harness
├── The Pulse Array (x=0, y=-100)           /app/graph-pulse
├── Command Deck (x=0, y=0, z=+200)        /app/settings, /app/billing
└── Brain Relay (x=+150, y=+100)            /app/brain-endpoints
```

Each location has a subtle environmental signature: the Constellation has denser star particles, the Observatory has orbiting measurement instruments. These are not obtrusive. They provide subconscious wayfinding.

**Navigation methods:**

1. **Direct click:** Click any visible object in the scene (a star, a location beacon) and the camera smoothly transitions to it
2. **Command palette:** `Cmd+K` / `Ctrl+K` opens the command palette (a holographic panel, not a traditional dropdown). Type a location name, graph name, or entity name. Select to navigate
3. **Sidebar rail:** A minimal vertical rail on the left edge of the screen (not a full sidebar) with 7 icon buttons for the 7 locations. Hover shows the location name. Click transitions the camera. The rail is semi-transparent (`rgba(17, 26, 33, 0.6)`) and glows on hover
4. **Keyboard sequences:** `g` then `c` for Constellation, `g` then `e` for Observatory, etc. (same as current shortcuts)
5. **Breadcrumb trail:** A holographic breadcrumb at the top of the screen shows the current location chain. Each segment is clickable to navigate back up

---

## Part II: Holographic Panels (The HUD System)

Every piece of traditional UI (forms, tables, lists, metrics, controls, text content) renders as a Holographic Panel. Panels are HTML elements rendered via CSS2DRenderer (layered on top of the WebGL canvas) with a consistent visual treatment.

### 2.1 Panel Anatomy

```
┌─────────────────────────────────────────┐  ← Bevel edge (1px, 45° clip on corners)
│ ▪ Title Text                    [—][×] │  ← Header bar (32px, darker)
├─────────────────────────────────────────┤  ← Divider (brand gradient, 1px)
│                                         │
│  Content area                           │  ← Body (scrollable if needed)
│  (any React component)                  │
│                                         │
├─────────────────────────────────────────┤
│  Footer actions                  [Save] │  ← Footer (optional, 40px)
└─────────────────────────────────────────┘
     ╲                               ╱
      ╲─────── Anchor line ─────────╱       ← Thin line connecting panel to its
                    │                           3D object (optional)
                    ▼
              [3D Object]
```

**Visual treatment:**

- **Background:** `rgba(11, 16, 20, 0.82)` with `backdrop-filter: blur(16px) saturate(1.2)`. The blur creates the frosted glass effect. The saturation boost prevents the blur from looking washed out
- **Border:** 1px `rgba(36, 54, 69, 0.7)` (`--border` at 70% opacity)
- **Corner clips:** The four corners are clipped at 45 degrees (8px clip using `clip-path: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px)`). This is the Warframe signature
- **Header bar:** `rgba(17, 26, 33, 0.9)`, 32px height. Title in `--foreground` (14px, 500 weight, uppercase tracking 0.05em). Close button (×) and minimize button (—) on the right
- **Divider:** 1px height, the brand gradient (`linear-gradient(90deg, #07A288, #5BBE4E, #B8E52B)`) at 60% opacity
- **Shadow:** `0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(7, 162, 136, 0.3)`. The teal inner glow prevents panels from looking like they're floating in a void
- **Anchor line:** When a panel is associated with a 3D object (e.g., an entity detail panel anchored to a meshframe), a thin line (1px, `#243645` at 50% opacity) connects the panel's bottom-center to the object's screen-space position. The line updates every frame

**Panel entrance animation:**
Panels do not simply appear. They materialize:
1. Frame 0: Panel is 0% opacity, scaled to 95% on both axes, translated 20px upward from final position
2. Frame 0-200ms: Opacity fades to 100%, scale tweens to 100%, position settles (cubic-bezier 0.16, 1, 0.3, 1)
3. Frame 200-350ms: The corner clip lines briefly flash brighter (the bevel edges glow `#07A288` at 80% opacity then fade to normal border). This creates a "power-on" effect

**Panel exit animation:**
Reverse of entrance: scale to 95%, opacity to 0%, translate 10px upward. Duration 150ms. Faster than entrance because dismissal should feel instant.

**Panel types:**

| Type | Width | Behavior | Example |
|------|-------|----------|---------|
| **Inspector** | 360px, right-anchored | Attached to selected 3D object. Moves with object if camera pans. Dismisses on deselect | Entity detail, node properties |
| **Workspace** | 800-1200px, centered | Full working area for complex interactions. Darkens background slightly | Schema Observatory, Compliance review |
| **Command** | 480px, top-centered | Transient input. Auto-dismisses after action | Command palette, search, quick settings |
| **Toast** | 320px, bottom-right | Auto-dismisses after 4s. No header bar. Compact | Notifications, confirmations, errors |
| **Dashboard** | Flexible, grid-arranged | Multiple panels arranged in a responsive grid. Each panel is independent | Settings, Billing, Admin |

### 2.2 Panel Interactions

- **Drag:** Panels with headers are draggable (grab the header bar). Position persists during the session. Panels snap to a 16px grid when near edges
- **Resize:** Workspace panels have a resize handle on the bottom-right corner (the standard CSS resize cursor appears). Minimum dimensions enforced per panel type
- **Stack order:** Most recently interacted panel rises to front. Clicking a panel brings it forward
- **Minimize:** The minimize button (—) collapses the panel to just its header bar (32px tall). Click again to restore. Minimized panels stack at the bottom of the screen
- **Focus ring:** When a panel is focused (clicked or tabbed into), its border briefly flashes `#07A288` (200ms)

### 2.3 Responsive Behavior

On screens narrower than 1024px, the 3D scene becomes a background layer and panels render in a traditional stacked layout (scrollable, full-width). The 3D scene remains visible behind the panels but the camera locks to a fixed position and auto-rotates slowly. Navigation switches from spatial movement to the sidebar rail (which expands to a full sidebar on mobile).

On screens narrower than 640px, the 3D scene is replaced with a simplified 2D constellation view (SVG-based) and all panels render as full-screen sheets (Radix Sheet, slide up from bottom). The 3D visualization pages (graph explorer, theatre) still use Three.js but the surrounding chrome is fully 2D.

---

## Part III: The Meshframe Taxonomy

### 3.1 Design Principles

Every entity type has a unique wireframe geometry (meshframe) that serves three purposes:

1. **Identification:** You should be able to tell what type an entity is from its silhouette alone, at any distance. A Person and an Infrastructure node should be distinguishable even when they're small dots at the edge of the screen
2. **Semantic resonance:** The geometry should evoke its meaning. A Person should feel humanoid. Infrastructure should feel structural. A Credential should feel like something that locks or unlocks. This is not about literal representation (no stick figures, no padlock icons). It is about geometric language that triggers the right associations
3. **Family coherence:** Types that are conceptually related should share geometric DNA. Person and Organization are both about people, so they share bilateral symmetry and organic curves. Infrastructure and Service are both about systems, so they share lattice structures and cylindrical elements. This means you can glance at a dense graph and immediately see clusters of related types by their geometric family

### 3.2 Geometric Families

The 13 entity types are organized into 5 geometric families. Each family has a shared geometric language (symmetry type, edge style, primary form) and each type within the family has a unique silhouette.

---

#### Family A: Sentient Forms (bilateral symmetry, organic curves)

These entities represent people and groups of people. They share bilateral symmetry (left-right mirror) and incorporate curved elements that evoke organic, living forms. They are the only family with bilateral symmetry, which makes them instantly recognizable as "about people."

**A1: Person**

A standing figure abstracted to pure geometry. The silhouette reads as humanoid without being a literal body.

Construction:
- **Core:** An elongated octahedron (8 faces, stretched 2:1 on the vertical axis) forms the torso. Vertices at (0, ±1.5, 0), (±0.6, 0.3, ±0.3). This creates a diamond shape that tapers at the top (head region) and bottom
- **Head datum:** A small icosahedron (detail level 0, scale 0.25) floats 0.3 units above the top vertex, connected by two thin wireframe struts. Not a sphere. The icosahedral faceting keeps it geometric
- **Arm geometry:** Two mirrored struts extend from the mid-torso vertices, angled 30 degrees downward, length 0.8 units. Each terminates in a small tetrahedron (scale 0.1). The struts have a slight outward curve (quadratic Bezier, control point offset 0.15 units outward)
- **Base:** Two diverging struts from the bottom vertex, angled 20 degrees outward, creating a stable stance silhouette

Wireframe style: All edges rendered with `LineBasicMaterial`, color from entity type palette. Edge thickness 1.5px. No filled faces. The wireframe-only rendering is non-negotiable across all types.

Idle animation: Gentle sine-wave float (amplitude 0.15 units, period 3 seconds) on y-axis. Slow rotation around y-axis (0.003 rad/frame). The head datum rotates independently at 0.005 rad/frame (slightly faster than the body), creating a "looking around" quality.

**A2: Organization**

A formation of smaller elements arranged in a structured group, evoking a team or institution.

Construction:
- **Central column:** A hexagonal prism (6-sided, height 1.2, radius 0.4), wireframe only. This is the "building" or "institution" core
- **Ring of satellites:** 5 small octahedra (scale 0.15 each) arranged in a pentagon formation around the central column, at radius 1.0, y-offset 0.2 above center. Each satellite is connected to the central column by a thin strut
- **Crown:** A flat hexagonal ring (wireframe torus with tube radius 0.02, ring radius 0.6) floating 0.3 units above the top of the central column. This gives the silhouette a "head" that echoes the Person type's head datum but as a collective ring rather than an individual point

Idle animation: The central column rotates slowly (0.002 rad/frame). The satellite ring rotates in the opposite direction (0.001 rad/frame), creating a counter-rotating orbital effect. Each satellite has its own micro-rotation.

**Family coherence:** Both Person and Organization share bilateral symmetry (left-right mirror in their resting orientation), vertical orientation (taller than wide), and a distinct "head" element at the top. The Person has an individual head datum, the Organization has a collective crown ring. When viewed from a distance, both types read as "upright, vertical, topped" which is the Sentient family signature.

---

#### Family B: Structural Lattice (cubic symmetry, grid patterns)

These entities represent infrastructure, services, and configurations: the built environment. They share cubic or rectangular symmetry and incorporate grid/lattice patterns that evoke engineered systems. They look constructed.

**B1: Infrastructure**

A space station module: a skeletal rectangular frame with internal cross-bracing.

Construction:
- **Outer frame:** A wireframe box (1.6 x 1.0 x 1.0), edges only. 12 edges of the cuboid
- **Internal cross-bracing:** Face diagonals on the two largest faces (front and back), creating X patterns. These 4 diagonal edges give structural rigidity to the silhouette
- **Docking rings:** Two wireframe circles (radius 0.3) centered on the two smallest faces (left and right), perpendicular to the x-axis. These extend the silhouette beyond the box and read as "connection ports"
- **Antenna mast:** A single strut extending upward from the top-center of the box, length 0.5, topped with a small cross (+) formed by two perpendicular short struts (length 0.2 each)

Idle animation: Very slow rotation (0.001 rad/frame, the slowest of any type). Infrastructure is stable, massive, grounded. Gentle float on y-axis (amplitude 0.08, period 5 seconds, also the slowest).

**B2: Service**

A cylindrical array of vertical elements, like a server rack abstracted to geometry.

Construction:
- **Outer cage:** A wireframe cylinder (height 1.4, radius 0.5, 8 radial segments). Only the top ring, bottom ring, and 8 vertical struts are rendered (no face wireframe)
- **Internal shelves:** 3 wireframe horizontal rings at y = -0.3, 0, +0.3 within the cylinder, radius 0.35. These represent the "layers" of a service stack
- **Status beacon:** A small diamond (octahedron, scale 0.1) floating 0.2 units above the top ring, connected by a single strut. This pulses with emissive glow at 0.5 Hz, the "heartbeat" of a running service

Idle animation: No rotation. The cylindrical symmetry means rotation looks like nothing is happening. Instead, the internal shelf rings slowly oscillate up and down (each on its own phase, amplitude 0.05 units), creating a gentle "breathing stack" effect.

**B3: Configuration**

A flat panel grid, like a control surface or settings matrix.

Construction:
- **Base panel:** A wireframe rectangle (1.4 x 0.8, depth 0.1), oriented face-forward to the camera by default
- **Grid subdivision:** The face is subdivided into a 4x3 grid of wireframe rectangles (each 0.35 x 0.27). This creates a dashboard/control panel look
- **Toggle indicators:** 3 of the 12 grid cells have small diamond points (scale 0.05) at their centers, randomly selected per instance (seeded by entity ID). These represent "active settings"
- **Side tabs:** Two small rectangular tabs extending from the right edge (0.2 x 0.1 each), stacked vertically. These break the rectangular symmetry and add visual interest

Idle animation: Slow tilt oscillation (rotating ±5 degrees around the x-axis, period 4 seconds). The panel gently tilts toward and away from the viewer, catching different lighting angles.

**Family coherence:** All three Structural types share rectangular/cylindrical forms with internal subdivision. They all look "built" rather than organic. Infrastructure is the largest and most complex (a station), Service is a vertical rack, Configuration is a flat panel. They share grid patterning and right angles. When clustered in a graph, they collectively read as "the engineered layer."

---

#### Family C: Crystalline Abstractions (polyhedral symmetry, faceted surfaces)

These entities represent ideas, technologies, and products: things that exist as concepts or artifacts rather than physical infrastructure. They share polyhedral symmetry (Platonic and Archimedean solids) and faceted surfaces that catch light at interesting angles. They look refined and precise.

**C1: Concept**

A geodesic shell: a faceted sphere that represents containment of an idea.

Construction:
- **Outer shell:** An icosahedron (20 triangular faces, wireframe only, radius 0.7). The icosahedron is the most symmetrical Platonic solid that isn't a sphere, giving Concepts a sense of completeness
- **Inner point:** A single point light (or small emissive sphere, radius 0.05) at the center, visible through the wireframe. This represents the "core idea" inside the shell
- **Meridian ring:** A wireframe great circle (radius 0.72, slightly larger than the icosahedron) tilted 30 degrees from the equator. This ring breaks the perfect symmetry and adds the appearance of an orbital or boundary

Idle animation: Slow tumble (rotation around a tilted axis, 0.002 rad/frame). The inner point pulses gently (emissive intensity oscillating between 0.5 and 1.0, period 6 seconds).

**C2: Technology**

A faceted gem or crystal: precise, angular, engineered.

Construction:
- **Upper crown:** A pentagonal pyramid (5 triangular faces, wireframe, height 0.8, base radius 0.6). The pyramid points upward
- **Lower pavilion:** An inverted pentagonal pyramid (mirrored below the base plane, height 0.5, base radius 0.6). Together with the crown, this creates a diamond/gem cross-section
- **Girdle ring:** A wireframe decagon (10-sided polygon) at the junction of crown and pavilion, radius 0.65. This is the widest point and catches the most light
- **Table facet:** A small wireframe pentagon (radius 0.2) at the very top of the crown, parallel to the ground. This is the "top surface" of the cut gem

Idle animation: Rotation around y-axis at 0.004 rad/frame (faster than most types, technology moves fast). The faceted geometry catches the directional lights at different angles as it rotates, creating a sparkle effect without any special shader.

**C3: Product**

A prism with distinguishing marks: something manufactured, with identity.

Construction:
- **Core prism:** A triangular prism (equilateral triangle cross-section, side length 0.8, depth 1.0), wireframe only. Oriented with one rectangular face toward the camera
- **Label band:** A wireframe rectangle (0.8 x 0.3) floating 0.05 units in front of the forward rectangular face, centered. This represents a "label" or "brand identity" on the product
- **Base platform:** A thin wireframe hexagon (radius 0.5, height 0.05) beneath the prism, creating a display pedestal

Idle animation: Slow rotation around y-axis (0.003 rad/frame). Gentle y-axis float (amplitude 0.1, period 3.5 seconds).

**Family coherence:** All Crystalline types share faceted, polyhedral forms with high symmetry. They all feel "cut" or "designed." Concept is spherical (all-encompassing), Technology is gem-like (precise, valuable), Product is prismatic (manufactured, displayable). They share the quality of catching light at interesting angles due to their flat faces meeting at defined angles.

---

#### Family D: Informational Planes (planar symmetry, layered sheets)

These entities represent recorded knowledge: documents, policies, and credentials. They share planar geometry (flat elements, pages, cards) and layered construction. They look like things you would read or hold.

**D1: Document**

Layered pages, slightly fanned, like an open manuscript floating in space.

Construction:
- **Page stack:** 3 wireframe rectangles (1.0 x 1.4 each), stacked with 0.08 unit separation on the z-axis. Each page is slightly rotated relative to the one below it (2 degrees per page around the y-axis), creating a subtle fan effect
- **Corner fold:** The top-right corner of the front page is modeled as a small triangle fold (the corner vertex is displaced inward 0.15 units on both x and y). This classic "document" signifier works even in wireframe
- **Binding edge:** A wireframe line runs along the left edge of all three pages, connecting them. This represents the spine

Idle animation: Gentle oscillation around the y-axis (±3 degrees, period 4 seconds), as if the pages are being riffled by a breeze. Each page oscillates with a slight phase offset (50ms between pages), creating a ripple.

**D2: Policy**

A shield or badge shape: authoritative, protective.

Construction:
- **Shield body:** A custom wireframe shape: two straight edges forming the top (horizontal, width 1.0), two curved edges sweeping downward and inward to meet at a point at the bottom. Total height 1.3. The curves are quadratic Beziers with control points offset outward, creating the classic heraldic shield silhouette
- **Internal chevron:** A V-shaped pair of lines inside the shield, from 1/3 height on each side to center-bottom. This creates an internal "rank" marking
- **Top bar:** A wireframe rectangle (1.2 x 0.1) across the very top of the shield, extending slightly beyond the shield's width on each side. This is the "authority header"

Idle animation: Very minimal. Slow pendulum swing (±2 degrees around the y-axis, period 6 seconds). Policies are stable and authoritative. They don't dance.

**D3: Credential**

A key or token shape: something that grants or restricts access.

Construction:
- **Bow (handle):** A wireframe circle (radius 0.3) on the left side. This is the "grip" end of the key
- **Blade (shaft):** A wireframe rectangle (0.8 x 0.2) extending rightward from the circle's rightmost point. This is the "shaft"
- **Bit (teeth):** 3 small rectangular notches cut into the bottom edge of the blade (each 0.1 x 0.1), at positions 0.3, 0.5, 0.7 along the blade length. These are the "key cuts" that make each credential unique
- **Ward ring:** A small wireframe circle (radius 0.1) at the junction of bow and blade, the "keyhole" reference

Idle animation: Slow rotation around the z-axis (the key spins flat, like it's being twirled in a lock). 0.002 rad/frame. Occasional brief acceleration (every 8-12 seconds, randomly, the rotation speeds to 0.01 for 500ms then decelerates back), as if the key is being "tried."

**Family coherence:** All Informational types share planar, flat construction. They are the thinnest meshframes when viewed from the side. Document is layered pages, Policy is a shield plate, Credential is a flat key. They all read as "things that carry information on a surface."

---

#### Family E: Spatial and Temporal Markers (radial symmetry, emanating forms)

These entities represent places and moments: things that exist at a point in space or time. They share radial symmetry (symmetry around a central point) and forms that emanate outward, as if marking or broadcasting from a location.

**E1: Location**

A compass rose or navigation beacon: marking a place.

Construction:
- **Core sphere:** A wireframe icosahedron (detail 0, radius 0.25) at the center. Smaller than Concept's icosahedron
- **Cardinal points:** 4 elongated diamond shapes (kite quadrilaterals, wireframe) extending outward from the core along the +x, -x, +z, -z axes. Each is 0.8 units long and 0.2 units wide at its widest point. These are the compass cardinal directions
- **Ordinal points:** 4 shorter diamond shapes (0.4 units long) at 45-degree angles between the cardinals. These are the ordinal directions (NE, SE, SW, NW)
- **Latitude ring:** A wireframe circle (radius 1.0) in the xz-plane, passing through the tips of the cardinal points. The equatorial reference

Idle animation: Slow rotation around y-axis (0.002 rad/frame). The cardinal and ordinal points create a beautiful star pattern when viewed from above.

**E2: Event**

A starburst or temporal explosion: marking a moment.

Construction:
- **Core:** A small stellated octahedron (8 faces, each subdivided into a spike that extends outward, total radius 0.3). This spiky form reads as "explosion" or "impact"
- **Emanation rays:** 6 thin wireframe lines extending outward from the stellated vertices, length 0.6 units each. These are the "shockwave" rays extending from the event
- **Temporal ring:** A wireframe circle (radius 0.8) perpendicular to the y-axis (horizontal), representing the event's "time horizon." Dashed line material (dash 0.05, gap 0.05) to distinguish it from the continuous rings used by other types
- **Clock hand:** A single wireframe line from the center extending to the temporal ring at a random angle (seeded from entity ID). This marks the event's "time" within its cycle

Idle animation: The emanation rays pulse: they cycle between 80% and 100% length (period 2 seconds, fast for a meshframe), creating a "radiating" quality. The temporal ring rotates slowly around the y-axis.

**Family coherence:** Both Spatial/Temporal types emanate outward from a center point. Location has a horizontal compass plane, Event has a horizontal time ring. Location is structured and orderly (cardinal directions), Event is explosive and dynamic (spikes and rays). They share radial symmetry that distinguishes them from all other families.

---

### 3.3 Visual Parameters Driven by Data

Beyond the base geometry, each meshframe instance is modified by the entity's data:

| Data Property | Visual Effect | Range |
|---|---|---|
| **Connection count (degree)** | Scale multiplier | 0 connections = 0.6x scale, 20+ = 1.8x. Logarithmic. Hub entities are visually larger |
| **Freshness score** | Opacity and emissive intensity | Fresh (1.0) = full opacity, bright wireframe. Stale (0.0) = 25% opacity, dim wireframe. Linear interpolation |
| **Confidence** | Edge rendering | High confidence edges = solid wireframe. Low confidence = dashed wireframe (`LineDashedMaterial`, dash 0.1, gap 0.05) |
| **Data classification** | Wireframe color intensity | Public = standard color. Internal = slightly brighter. Confidential = noticeably brighter, faint glow aura. Restricted = brightest, prominent glow, thin red accent ring |
| **Status (Active/Deprecated/Contested)** | Edge style on connected edges | Active = solid. Deprecated = dashed, 35% opacity. Contested = animated dash (dash pattern scrolls at 0.5 units/sec), amber color |
| **Entity name hash** | Per-instance variation | Seed variation in rotation speed (±20%), float amplitude (±15%), and initial rotation angle. No two instances of the same type are identical |
| **Source (Graph Pulse agent)** | Accent marking | Entities contributed by Graph Pulse carry a small orbiting diamond (scale 0.05) that orbits the meshframe at radius +0.3. Color: `#8B5CF6` (graph pulse purple) |

### 3.4 Type Color Palette

Each entity type has a primary wireframe color, used for all edges and the type indicator in legends/filters:

| Type | Hex | HSL | Rationale |
|---|---|---|---|
| Person | `#3B82F6` | 217 91% 60% | Blue. Human, trustworthy, personal |
| Organization | `#6366F1` | 239 84% 67% | Indigo. Institutional, deeper than person-blue |
| Concept | `#8B5CF6` | 258 90% 66% | Purple. Abstract, philosophical |
| Technology | `#06B6D4` | 188 94% 43% | Cyan. Digital, technical, electric |
| Location | `#22C55E` | 142 71% 45% | Green. Natural, grounded, places |
| Event | `#F59E0B` | 38 92% 50% | Amber. Temporal, urgent, happening |
| Product | `#EC4899` | 330 81% 60% | Pink. Commercial, attention-grabbing |
| Document | `#94A3B8` | 215 16% 65% | Slate. Neutral, paper-like, informational |
| Configuration | `#14B8A6` | 174 84% 40% | Teal. Technical but distinct from Technology cyan |
| Credential | `#EAB308` | 48 96% 47% | Gold. Valuable, key-like, secure |
| Policy | `#EF4444` | 0 84% 60% | Red. Authoritative, mandatory, stop-and-read |
| Service | `#A78BFA` | 258 90% 76% | Lavender. Running, active, lighter than Technology |
| Infrastructure | `#78716C` | 30 5% 45% | Stone. Heavy, foundational, structural |

These colors are chosen for maximum mutual distinguishability at both full size and small-dot size, tested against the `#0B1014` background. Every pair of adjacent types in the palette has a deltaE (CIEDE2000) of at least 20.

---

## Part IV: The Constellation (Home)

### 4.1 Scene Layout

The Constellation is the default camera position when the app loads. It shows all of the user's knowledge graphs as stars floating in the Void.

This is functionally identical to the Constellation View described in the frontend additions document, but now it is the application's home rather than a page you navigate to. Every other location in the app is reached by navigating away from (and back to) the Constellation.

**Stars** are the same procedural icosahedron geometry described in the Constellation View spec: sized by entity count, colored by freshness on the brand gradient, pulsing when extraction is active.

**The audio engine activates here.** When the Constellation loads, the Drone Field layer begins playing (seeded from the aggregate graph statistics across all knowledge bases). Each star contributes to the soundscape: more stars = more harmonic complexity. Hovering a star briefly accents its contribution. Clicking a star and zooming in transitions the audio seed to that specific graph's data.

### 4.2 Zooming Into a Star

When the user clicks a star (or navigates via command palette / sidebar), the camera smoothly transitions toward the star. As the camera approaches:

1. **Distance 50-20 units:** The star's icosahedron grows. Other stars fade to 20% opacity. The star's entity count, freshness, and name become visible as a floating label
2. **Distance 20-5 units:** The star dissolves and the knowledge graph materializes in its place. Entities appear as their meshframes, positioned by the force-directed layout. Edges appear between them. This is the "star explodes into its contents" transition, taking 800ms total
3. **Distance <5 units:** Full graph explorer mode. All graph interaction tools are available (search, filter, query, temporal rewind, provenance, ghost overlay). The Holographic Panels for entity inspection materialize on click. The URL updates to `/app/knowledge-graph/:id`

**Zooming back out:** The user can zoom out (scroll wheel, or click the breadcrumb "Constellation" link, or press `Escape`). The graph collapses back into its star (reverse of the explosion, 600ms). Other stars fade back to full opacity.

This transition is the single most important UX moment in the application. It communicates the entire mental model: stars are graphs, graphs are made of entities, you can zoom in and out between the meta-view and the detail view seamlessly.

### 4.3 The Empty Constellation

First-time users see an empty Void with a single beacon: a slowly pulsing wireframe compass rose (the Location meshframe, but larger, glowing brighter) with a label "Your knowledge awaits." Clicking it opens the Cartographer at the First Landing region.

---

## Part V: The Cartographer (Onboarding)

### 5.1 The Map

The Cartographer exists as a distinct location in the Void (x=-200). When the camera navigates there, the user sees a 3D territory map floating in space: a terrain surface rendered as a wireframe mesh (perlin noise displacement on a 100x100 grid plane), with the five regions as distinct elevated features on the terrain.

Each region is a cluster of glowing wireframe structures on the terrain surface:

| Region | Terrain Feature | Geometry |
|---|---|---|
| First Landing | A small island with a lighthouse (tall wireframe cylinder + cone at top) | Simple, inviting, the first thing you see |
| The Living Archive | A mesa with clock tower geometry (wireframe cube + pyramid roof + clock face circle) | Elevated, archival, temporal |
| Uncharted Territory | A foggy valley with signpost geometries (wireframe poles + rectangular signs) | Mysterious, the fog is a particle system |
| The Confluence | A river junction (two wireframe sinusoidal curves merging into one wider curve) | Dynamic, the merge metaphor made literal |
| The Observatory | A hilltop dome (wireframe hemisphere + cylinder base + telescope strut) | The highest point, overlooking everything |

Undiscovered regions are rendered at 15% opacity with a fog particle overlay. Discovered regions are at full opacity with subtle ambient lighting from within.

The user clicks a region to enter it. The camera zooms into that region of the terrain, and the Cartographer's instructional content appears as Holographic Panels overlaid on the scene. The actual platform tools (upload dialog, graph explorer, schema observatory) embed within the panels as standard React components. The learning and the doing happen in the same space.

---

## Part VI: Audio Integration

### 6.1 Audio Presence Across Locations

The generative audio engine described in the audio design exploration is not a feature of the 3D graph page. It is the ambient layer of the entire application.

| Location | Audio State |
|---|---|
| **The Constellation** | Drone Field seeded from aggregate graph statistics. Each star subtly contributes pitch content based on its dominant entity type. Hovering a star briefly accents its pitch. The soundscape is warm, expansive, quiet |
| **Inside a Star (Graph Explorer)** | Full four-layer audio: Drone, Harmonic Canopy, Pulse Network, Crystal Chimes. All seeded from the specific graph's data. Pulses fire when edge energy pulses travel. Entity clicks trigger chimes |
| **The Cartographer** | A simpler, warmer variant of the Drone Field. No pulses or chimes. The scale is always major pentatonic (welcoming, non-threatening). As the user progresses through regions, the harmonic complexity gradually increases |
| **The Observatory (Eval Harness)** | Clinical, precise tones. Sine waves and clean timbres. No reverb warmth. The audio feels like a measurement instrument. Quality scores map to consonance/dissonance |
| **The Pulse Array (Graph Pulse)** | Active, event-driven. Each agent learning event triggers a Crystal Chime. The density of the soundscape reflects agent activity. Busy agents create busy music |
| **Command Deck (Settings/Billing)** | Minimal. Only the Drone Field at reduced volume. Administrative pages are calm |
| **Brain Relay** | Soft repeating tonal patterns. Each published Brain endpoint adds a repeating note at a slow interval, like a lighthouse beacon. More endpoints = richer rhythmic texture |

### 6.2 Audio Transitions

When navigating between locations, the audio cross-fades over the camera transition duration (800ms). The outgoing location's audio fades from current volume to 0%. The incoming location's audio fades from 0% to its configured volume. During the cross-fade, both are audible, creating a blended transition that mirrors the visual camera movement.

When zooming into a star, the Constellation's aggregate drone smoothly morphs into the specific graph's audio seed. This is not a cross-fade (which would create two separate sounds). It is a continuous parameter morph: the drone voices' pitches, the filter cutoff, and the scale selection all interpolate from the constellation values to the graph-specific values over 800ms. The listener hears one continuous sound that changes character.

### 6.3 Audio Controls

A small speaker icon in the bottom-right corner of the screen (part of the persistent HUD). Click to expand a compact audio panel:

- **Master volume slider** (default 0%, opt-in)
- **Layer toggles** with individual volume (Drone / Canopy / Pulses / Chimes)
- **Timing toggle** (Free / Soft Pulse)
- **Spatial audio toggle** (Stereo / 3D Headphones)
- The panel is a minimal Holographic Panel (Inspector type, 200px wide)

First interaction toast: "Sound is driven by your data. Every graph sounds different." Shown once, ever.

---

## Part VII: Creation Theatre in The Void

### 7.1 Entering the Theatre

When the user triggers graph extraction (from the Knowledge Base panel or the Cartographer), a "Watch It Build" option opens the Creation Theatre without navigating away from the current 3D scene. Instead, the Theatre takes over the current view:

1. All non-related 3D objects (other stars, beacons) fade to 10% opacity
2. The extraction target area clears (if viewing from the Constellation, the target star dissolves to make room; if already inside a graph, existing entities shift to the periphery)
3. The Dashboard Strip, Commentary Track, and Playback Controls materialize as Holographic Panels at the top, bottom, and bottom-center respectively
4. The source text sidebar is an Inspector panel anchored to the right edge
5. Construction begins in the now-cleared 3D space

This means the Theatre is not a separate page. It is a mode of the current scene. The URL updates to `/app/knowledge-graph/:id/theatre` but the camera has not teleported anywhere. The user is still "here," watching construction happen in front of them.

### 7.2 Post-Construction

When extraction completes, the Theatre mode dismisses: the HUD panels dissolve, the newly constructed graph is now the star's contents (or the graph explorer view), and the user is looking at their completed knowledge graph in the same position where they just watched it being built. There is no transition, no page load, no context switch. The graph simply is, where a moment ago it was becoming.

---

## Part VIII: Responsive Degradation

### 8.1 Quality Tiers

| Tier | Detection | 3D Capability | Panel Rendering |
|---|---|---|---|
| **High** | Discrete GPU detected, >4GB VRAM | Full scene, all particles, bloom, film grain | CSS2DRenderer overlays |
| **Medium** | Integrated GPU, >2GB VRAM | Reduced particles (50%), no film grain, reduced bloom | CSS2DRenderer overlays |
| **Low** | Weak GPU or mobile GPU | Minimal particles (10%), no post-processing, simplified meshframes (reduced vertex counts) | CSS2DRenderer overlays |
| **2D Fallback** | No WebGL 2.0, or user preference | SVG constellation, standard React pages | Standard DOM rendering |

Detection runs automatically on first load (1-second GPU benchmark rendering 10,000 triangles and measuring frame time). Users can override in Settings.

### 8.2 Mobile Experience

On mobile (< 768px screen width), the experience switches to the 2D Fallback tier. The constellation becomes an SVG star map (touch-friendly). All panels render as full-screen sheets (swipe to dismiss). The graph explorer uses the 2D ReactFlow renderer. The audio engine is available but defaults to off (mobile speakers are inadequate for ambient audio).

The 3D experience is explicitly designed for desktop/laptop with a mouse. Mobile gets a fully functional but visually simplified interface.

---

## Part IX: Technical Architecture

### 9.1 Renderer Stack

```
┌─────────────────────────────────┐
│  React Root (standard DOM)      │  ← Sidebar rail, command palette, toasts
├─────────────────────────────────┤
│  CSS2DRenderer Layer            │  ← Holographic Panels (HTML over canvas)
├─────────────────────────────────┤
│  EffectComposer Layer           │  ← Bloom, grain, vignette
├─────────────────────────────────┤
│  WebGLRenderer Layer            │  ← 3D scene (meshframes, stars, particles)
└─────────────────────────────────┘
```

All layers share the same DOM container. The WebGL canvas is position: absolute, filling the viewport. The CSS2DRenderer is layered on top (pointer-events: none on the container, pointer-events: auto on individual panels). Standard React DOM elements (sidebar, command palette) are position: fixed on top of everything.

### 9.2 Scene Graph Management

A single Three.js Scene instance persists for the entire application lifetime. Location changes add/remove objects from the scene rather than creating new scenes. This prevents the initialization cost of recreating the WebGL context, particle systems, and post-processing on every navigation.

```typescript
class VoidScene {
  private scene: THREE.Scene;
  private locations: Map<string, LocationManager>;
  private activeLocation: string;
  
  navigate(locationId: string): void {
    // 1. Animate out current location's objects
    // 2. Update camera target
    // 3. Animate in new location's objects
    // 4. Update audio engine seed
    // 5. Update URL
  }
}
```

### 9.3 Performance Budget

| Resource | Budget | Notes |
|---|---|---|
| Total draw calls per frame | < 200 | Use instanced rendering for particles, merge meshframe geometries where possible |
| Triangle count | < 500,000 | Wireframe-only meshframes are inherently low-poly |
| Texture memory | < 128 MB | Minimal textures (label sprites, noise textures for nebula) |
| JS heap | < 256 MB | Dispose geometries and materials when leaving locations |
| Initial load (gzipped) | < 2 MB | Code-split Three.js, lazy-load location managers |
| Time to interactive | < 3 seconds | Show loading screen with animated wireframe while scene initializes |

### 9.4 Loading Experience

Before the 3D scene is ready, the user sees a full-screen loading view:

- Background: `#0B1014`
- Center: A single wireframe meshframe (rotating, the Technology gem) drawn with a simple canvas 2D fallback (no WebGL needed)
- Below: The brand gradient progress bar (thin, 2px)
- Below that: Loading stage text in muted color ("Initializing renderer..." → "Building the void..." → "Plotting your stars...")

The loading messages should be warm and evocative, not technical. They set the tone for the experience.

---

## Part XI: Migration from Current Frontend

### 11.1 What Stays

- All React components for panel content (forms, tables, charts, lists) remain unchanged. They render inside Holographic Panels instead of inside page layouts
- TanStack Query hooks and data fetching patterns are unchanged
- Authentication flow is unchanged (login page is a standard 2D page, the 3D experience begins after auth)
- All keyboard shortcuts carry over
- The design system color tokens carry over (they drive both the 3D scene and the panel styles)
- shadcn/UI components continue to work inside panels

### 11.2 What Changes

- `wouter` routing still manages URLs but the route components now trigger camera navigation instead of DOM page swaps
- The `AppSidebar` is replaced by the vertical icon rail + command palette
- Page components become panel content components (they lose their outer layout wrappers)
- The 2D ReactFlow graph view becomes an alternative mode within the 3D scene (toggle between 2D overlay and 3D native)
- The existing 3D knowledge graph components (`knowledge-graph-3d/`) are refactored into the unified scene system

### 11.3 What's New

- `VoidScene` class managing the persistent 3D environment
- `HolographicPanel` component (the universal panel wrapper)
- `LocationManager` classes for each location in the Void
- `MeshframeFactory` generating the 13 entity type geometries
- `GraphAudioEngine` managing the four-layer generative audio
- `CameraNavigator` handling smooth transitions between locations
- `QualityDetector` benchmarking GPU and selecting quality tier
- `ConstellationRenderer` managing the star field
- `CreationTheatreMode` managing the Theatre as a scene mode rather than a page

---

## Appendix A: Keyboard Shortcut Reference

### Global (Always Active)

| Key | Action |
|---|---|
| `Cmd+K` / `Ctrl+K` | Open command palette |
| `Escape` | Close panel / deselect / zoom out one level |
| `g` then `c` | Navigate to Constellation |
| `g` then `p` | Navigate to Pulse Array |
| `g` then `e` | Navigate to Observatory |
| `g` then `s` | Navigate to Command Deck (Settings) |
| `g` then `b` | Navigate to Brain Relay |
| `g` then `l` | Navigate to Cartographer |

### Graph Explorer (Inside a Star)

| Key | Action |
|---|---|
| `/` | Open entity search |
| `f` | Fit view (frame all entities) |
| `h` | Hide selected entity |
| `t` | Toggle Temporal Rewind |
| `p` | Open Provenance Thread (entity selected) |
| `q` | Toggle natural language query panel |
| `1-4` | Switch layout algorithm |
| `+` / `-` | Zoom in / out |
| `w` | Open Creation Theatre (if extraction running) |

### Creation Theatre

| Key | Action |
|---|---|
| `Space` | Play / Pause |
| `s` | Slow motion toggle |
| `→` | Next keyframe (replay mode) |
| `←` | Previous keyframe (replay mode) |
| `1-5` then `0` | Speed: 1x, 2x, 5x, 10x |

### Audio

| Key | Action |
|---|---|
| `\` | Toggle audio on/off |
| `[` | Decrease master volume |
| `]` | Increase master volume |

---

## Appendix B: Meshframe Vertex Counts

Performance reference for each meshframe type at default scale:

| Type | Vertices | Edges | Triangles (for picking only) | Family |
|---|---|---|---|---|
| Person | 22 | 28 | 0 (wireframe only) | Sentient |
| Organization | 38 | 48 | 0 | Sentient |
| Concept | 14 | 32 | 0 | Crystalline |
| Technology | 18 | 30 | 0 | Crystalline |
| Location | 30 | 40 | 0 | Spatial |
| Event | 26 | 36 | 0 | Spatial |
| Product | 14 | 20 | 0 | Crystalline |
| Document | 16 | 20 | 0 | Informational |
| Configuration | 28 | 36 | 0 | Structural |
| Credential | 18 | 22 | 0 | Informational |
| Policy | 12 | 14 | 0 | Informational |
| Service | 34 | 40 | 0 | Structural |
| Infrastructure | 24 | 32 | 0 | Structural |

Total for a 200-entity graph: ~4,400 vertices, ~6,000 edges. Well within real-time rendering budget.

For picking (click detection), invisible THREE.Mesh objects with simple bounding geometries (spheres or boxes) are used. These are never rendered but participate in raycasting.

---

## Appendix C: CSS Custom Properties (Additions for Holographic Panels)

```css
:root {
  /* Panel system */
  --panel-bg: rgba(11, 16, 20, 0.82);
  --panel-blur: 16px;
  --panel-border: rgba(36, 54, 69, 0.7);
  --panel-header: rgba(17, 26, 33, 0.9);
  --panel-shadow: 0 8px 32px rgba(0, 0, 0, 0.5), 0 0 1px rgba(7, 162, 136, 0.3);
  --panel-clip: polygon(8px 0, calc(100% - 8px) 0, 100% 8px, 100% calc(100% - 8px), calc(100% - 8px) 100%, 8px 100%, 0 calc(100% - 8px), 0 8px);
  --panel-enter-duration: 200ms;
  --panel-exit-duration: 150ms;
  
  /* Anchor line */
  --anchor-color: rgba(36, 54, 69, 0.5);
  --anchor-width: 1px;
  
  /* Sidebar rail */
  --rail-bg: rgba(17, 26, 33, 0.6);
  --rail-width: 48px;
  --rail-hover: rgba(7, 162, 136, 0.15);
  --rail-active: rgba(7, 162, 136, 0.25);
  
  /* Loading screen */
  --loading-bg: #0B1014;
  --loading-bar-height: 2px;
}
```

---

*The Bridge is not a dashboard wearing a 3D costume. It is a spatial operating environment where knowledge graphs are physical objects, navigation is movement, data is architecture, and sound is structure made audible. Every surface communicates. Every transition teaches. Every interaction feels like operating a system that was designed by people who believe tools should be as beautiful as the problems they solve.*