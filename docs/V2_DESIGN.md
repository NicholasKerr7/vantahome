# VantaHome v2 design

The property is the primary interface. Supporting screens should feel like tools belonging to that home, with a clear visual hierarchy and room to breathe.

## Visual language

- Use shared obsidian, jade, pearl, ice, and warm gold tokens. Reserve strong color for selection, primary actions, and meaningful device status.
- Use one VantaHome masthead. The embedded scene provides the environment controls; it does not repeat the brand.
- Keep the model on a continuous dark studio stage. Floating rounded controls, fine edge lighting, and restrained atmospheric gradients give supporting panels depth while preserving readable contrast.
- Use numbered destinations or collections where they help orientation. Numbers describe the collection order, never invented telemetry.
- Keep the model readable and large. Put its room/floor controls within easy thumb reach; expose detailed device controls on demand.
- Retain visible simulation labels. A polished interface must not imply a real device connection or verified assistant setup.

## Layout and interaction

The primary targets are phone portrait and tablet portrait/landscape. Desktop uses a tablet-sized preview. Primary home, menu, scene collection, routine collection, and settings views use bounded pages instead of vertical page scrolling. Long forms and device pickers may use contained scrolling where it is needed to preserve access to every field.

Use at least 44-point action targets, keyboard focus indicators, meaningful control labels, and text alongside status colors. Keep touch momentum and contained overscroll in scrollable editors. Respect reduced motion, and avoid animation that competes with the moving property.

Preserve service boundaries: visual changes do not add device transports, change permissions, or reinterpret connection states. Continue using the shared device capability catalog for quick and full controls.

## Motion and rendering

The optional Cinematic view gently sweeps the existing camera within a small arc. It preserves the current room, height, target, zoom, and device states. Touch, wheel, keyboard interaction, scene navigation, reduced motion, and suspension stop the sweep. Hotspots return when playback stops. The control is unavailable in immersive mode.

The scene stage uses one static shader plane; it adds no bloom pipeline, full-screen blur, external video, or large media download. Warm interior lighting contrasts with a cool studio rim. Rain, irrigation, vegetation, day/night, and device effects keep their existing simulation behavior.

Native supporting surfaces are still by default. Only the visible Home menu uses a slow orbital light treatment; voice feedback pulses only while actively listening. Motion respects live reduced-motion settings and app backgrounding. Hidden or retained quiet screens allocate no decorative animation subscriptions. Panel entrances use short opacity/transform transitions.

## Coverage

The home shell, property controls, Home menu, Scenes, Automations, Settings, integrations, voice, household, rooms, cameras, activity, and full device controls share the same visual language. Device color swatches still represent the actual selected lamp color, with contrasting text inside bright bulb previews. Long device forms retain contained scrolling; primary collections remain paged.
