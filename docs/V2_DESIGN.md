# VantaHome v2 design

The property is the primary interface. Supporting screens should feel like tools belonging to that home, with a clear visual hierarchy and room to breathe.

## Visual language

- Use the shared charcoal, warm ivory, and olive theme tokens. Reserve strong color for selection, primary actions, and meaningful device status.
- Use one VantaHome masthead. The embedded scene provides the environment controls; it does not repeat the brand.
- Favor open space, thin dividing rules, and descriptive typography over stacks of outlined cards, decorative gradients, and duplicated headers.
- Use numbered destinations or collections where they help orientation. Numbers describe the collection order, never invented telemetry.
- Keep the model readable and large. Put its room/floor controls within easy thumb reach; expose detailed device controls on demand.
- Retain visible simulation labels. A polished interface must not imply a real device connection or verified assistant setup.

## Layout and interaction

The primary targets are phone portrait and tablet portrait/landscape. Desktop uses a tablet-sized preview. Primary home, menu, scene collection, routine collection, and settings views use bounded pages instead of vertical page scrolling. Long forms and device pickers may use contained scrolling where it is needed to preserve access to every field.

Use at least 44-point action targets, keyboard focus indicators, meaningful control labels, and text alongside status colors. Keep touch momentum and contained overscroll in scrollable editors. Respect reduced motion, and avoid animation that competes with the moving property.

Preserve service boundaries: visual changes do not add device transports, change permissions, or reinterpret connection states. Continue using the shared device capability catalog for quick and full controls.

## Current pass

The home shell, embedded property layout, Home index, Scenes and Automations collections, Settings workspace, integrations, voice panel, and native device inspector establish this direction. Household, camera, history, and deeper management/editor screens can adopt the same composition in subsequent passes; their existing functions remain available.
