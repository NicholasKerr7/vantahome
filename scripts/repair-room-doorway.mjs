/** Shorten the original hallway return to the bedroom wall junction at x=9.5 m.
 * The initial A101 shell overlapped the northeast bedroom's D07 aperture by
 * 0.813 m. Only the sixty end-cap/bevel vertices of that one wall move; all
 * other positions, normals, indices, furnishings and device parts are retained.
 * Run on the verified baseline before gas fixtures are appended and rehashed.
 */
export function repairNortheastDoorway(asset) {
  const { json, binary } = asset;
  const node = json.nodes.find((item) => item.name === 'ground--ivory');
  if (!node) return 0;
  const edits = [];
  for (const primitive of json.meshes[node.mesh].primitives) {
    const accessor = json.accessors[primitive.attributes.POSITION];
    const view = json.bufferViews[accessor.bufferView];
    if (accessor.type !== 'VEC3' || accessor.componentType !== 5126 || accessor.sparse || view.buffer !== 0) {
      throw new Error('Unexpected hallway position encoding; review the new export before repairing.');
    }
    for (let index = 0; index < accessor.count; index++) {
      const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0) + index * (view.byteStride ?? 12);
      const x = binary.readFloatLE(offset), y = binary.readFloatLE(offset + 4), z = binary.readFloatLE(offset + 8);
      if (x > 10.40 && x < 10.421 && y >= -0.001 && y < 2.798 && z >= -11.645 && z <= -11.491) edits.push({ offset, x });
    }
  }
  if (edits.length !== 0 && edits.length !== 60) throw new Error(`Hallway export drift: expected 60 affected vertices, found ${edits.length}.`);
  for (const { offset, x } of edits) binary.writeFloatLE(x - 0.92, offset);
  return edits.length;
}
