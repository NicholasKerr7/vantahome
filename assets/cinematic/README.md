# Cinematic card references

Generated with **built-in image_gen** on October 7, 2026. Exact prompts and keys
are recorded in [prompts.json](prompts.json). These are decorative concept
references, not photographs of the property, live camera feeds, device readings,
or visual confirmation that an action succeeded.

The collection contains 47 images: nine room families, four scene moods, and
34 hardware portraits covering all 30 supported device kinds plus bedside lamps,
solar street lights, ventilation fans, and a neutral fallback. Routines reuse the
image matching their visible purpose. Repeated bedrooms and bathrooms share
references rather than duplicating image payloads for each room.

## Packaging and selection

- JPEG, 640px longest edge, quality 56. Keep originals outside the repository.
- Native cards use `expo-image` and its memory/disk cache. Embedded cards use
  lazy, asynchronously decoded images; the packaged scene embeds them for offline use.
- Both surfaces select from the same pure, bounded registry in
  `packages/home-scene/src/cinematicArtwork.ts`. Never accept arbitrary image URLs.
- Local native and web asset maps are intentionally static so Metro and Vite can
  resolve every file. Add a new key to both maps when extending the collection.
- Classify only the already-visible room/device/scene/routine identity. Do not
  fetch private room metadata or add bridge permissions to select artwork.
- Images are decorative, excluded from accessibility, and cannot receive input.
  Text, status indicators, and controls remain authoritative. Camera feeds are
  never replaced with generated art.
- No artwork animation, minimum loading delay, or additional page height is used.
  Existing pagination, reduced-motion, and touch behavior are preserved.

## Replacing an image

Regenerate using its recorded prompt, inspect the result at actual card size,
then optimize the approved source to the existing key. On macOS:

```sh
sips -s format jpeg -s formatOptions 56 -Z 640 source.png --out assets/cinematic/KEY.jpg
```

Keep all 47 images within 2 MiB combined. Run the app and scene TypeScript/tests,
visually review phone and tablet cards, and rebuild with `npm run build:home-scene`.
The existing 32 MiB packaged scene limit is a separate hard gate. Do not increase
that limit to accommodate card artwork.
