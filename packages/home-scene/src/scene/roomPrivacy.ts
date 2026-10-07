import { BufferAttribute, BufferGeometry, Mesh, MeshStandardMaterial, Vector3, type Object3D } from 'three';
import type { RoomDefinition } from '../data';

/** Extract complete indoor triangles, since exported meshes batch furniture from many rooms by material. */
export function isolateRoomGeometry(scene: Object3D, room: RoomDefinition): Object3D {
  const copy = scene.clone(true);
  copy.updateMatrixWorld(true);
  const bounds = room.outdoor ? undefined : room.bounds;
  copy.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    if (!bounds) { node.visible = false; return; }
    const original = node.geometry as BufferGeometry;
    const positions = original.getAttribute('position');
    if (!positions) { node.visible = false; return; }
    const point = new Vector3();
    const inside = new Uint8Array(positions.count);
    for (let index = 0; index < positions.count; index += 1) {
      point.fromBufferAttribute(positions, index).applyMatrix4(node.matrixWorld);
      inside[index] = Number(point.x >= bounds[0] && point.x <= bounds[1]
        && point.z >= bounds[2] && point.z <= bounds[3] && point.y >= -0.3 && point.y <= 3);
    }
    const indices = original.getIndex();
    const count = indices?.count ?? positions.count;
    const groups = original.groups.length ? original.groups : [{ start: 0, count, materialIndex: 0 }];
    const retained: number[] = [];
    const geometry = new BufferGeometry();
    for (const group of groups) {
      const start = retained.length;
      for (let offset = group.start; offset + 2 < Math.min(count, group.start + group.count); offset += 3) {
        const a = indices?.getX(offset) ?? offset;
        const b = indices?.getX(offset + 1) ?? offset + 1;
        const c = indices?.getX(offset + 2) ?? offset + 2;
        if (inside[a] && inside[b] && inside[c]) retained.push(a, b, c);
      }
      if (retained.length > start) geometry.addGroup(start, retained.length - start, group.materialIndex ?? 0);
    }
    if (!retained.length) { node.visible = false; geometry.dispose(); return; }
    const vertexIds = [...new Set(retained)];
    const remap = new Map(vertexIds.map((id, index) => [id, index]));
    for (const [name, attribute] of Object.entries(original.attributes)) {
      const values = new Float32Array(vertexIds.length * attribute.itemSize);
      vertexIds.forEach((id, index) => {
        for (let component = 0; component < attribute.itemSize; component += 1) values[index * attribute.itemSize + component] = attribute.getComponent(id, component);
      });
      geometry.setAttribute(name, new BufferAttribute(values, attribute.itemSize));
    }
    geometry.setIndex(retained.map((id) => remap.get(id)!));
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
    node.geometry = geometry;
    node.userData = { ...node.userData, privateRoomGeometry: true };
    node.visible = true;
  });
  return copy;
}

/** Release only extracted geometry; cached full-home geometry and shared materials stay intact. */
export function disposeRoomGeometry(scene: Object3D): void {
  scene.traverse((node) => {
    if (node instanceof Mesh && node.userData.privateRoomGeometry === true) node.geometry.dispose();
  });
}

/** Show the authored exterior shell without furnishing or see-through interior windows. */
export function prepareExteriorOverview(scene: Object3D): Object3D {
  const copy = scene.clone(true);
  copy.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    if (/--(?:furniture|luxury-device)-|^(?:washer|dryer|family-tv|gas-fixture)-/.test(node.name)) {
      node.visible = false;
    }
    if (/^(?:ground|upper)--glass$/.test(node.name)) {
      // Clone no cached materials: an owner opening the same asset must retain its original glass.
      node.material = new MeshStandardMaterial({ color: '#465159', roughness: 0.32, metalness: 0.45 });
      node.userData = { ...node.userData, exteriorPrivacyMaterial: true };
    }
  });
  return copy;
}

/** Dispose only the opaque overview materials created for this presentation. */
export function disposeExteriorOverview(scene: Object3D): void {
  scene.traverse((node) => {
    if (node instanceof Mesh && node.userData.exteriorPrivacyMaterial === true) {
      for (const material of Array.isArray(node.material) ? node.material : [node.material]) material.dispose();
    }
  });
}
