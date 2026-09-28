"""Add editable gas devices to a copy of the delivered Blender master.

Blender --background --python scripts/add-gas-fixtures-to-blender.py --
  --source /path/to/seaview-luxury-smart-home.blend --output /path/to/with-gas.blend

The repository manifest/geometry are authoritative. Existing objects and materials
are untouched; static/runtimeDynamic tags remain compatible with the house exporter.
"""
from argparse import ArgumentParser
from pathlib import Path
import hashlib
import json
import sys

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

DEVICE_IDS = ('utility-gas-meter', 'kitchen-gas-leak')
CONVERSION = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))


def linear_color(hex_color):
    """Convert authored sRGB swatches into Blender's linear material input space."""
    channels = [int(hex_color[index:index + 2], 16) / 255 for index in (1, 3, 5)]
    return [channel / 12.92 if channel <= .04045 else ((channel + .055) / 1.055) ** 2.4 for channel in channels]


def create_material(key, surface):
    """Use separate materials so no authored finish on the original house is edited."""
    material = bpy.data.materials.new('Gas fixture ' + key)
    material.use_nodes = True
    color = (*linear_color(surface['color']), 1)
    material.diffuse_color = color
    shader = material.node_tree.nodes.get('Principled BSDF')
    shader.inputs['Base Color'].default_value = color
    shader.inputs['Roughness'].default_value = surface['roughness']
    shader.inputs['Metallic'].default_value = surface['metalness']
    return material


def create_part(collection, device, part, index, materials, outdoor):
    """Build a source-editable primitive and convert the exact runtime transform to Z-up."""
    name = f'Gas fixture {device["id"]} {index:02d} {part["name"]}'
    mesh = bpy.data.meshes.new(name)
    builder = bmesh.new()
    if part['shape'] == 'box':
        bmesh.ops.create_cube(builder, size=1)
    elif part['shape'] == 'cylinder':
        bmesh.ops.create_cone(builder, cap_ends=True, cap_tris=False, segments=20, radius1=.5, radius2=.5, depth=1)
        for vertex in builder.verts:
            x, y, z = vertex.co
            vertex.co = (x, z, -y)
    else:
        raise ValueError(f'Unexpected gas fixture shape {part["shape"]}')
    width, height, depth = part['size']
    for vertex in builder.verts:
        x, y, z = vertex.co
        vertex.co = (x * width, -z * depth, y * height)
    builder.normal_update()
    builder.to_mesh(mesh)
    builder.free()
    mesh.materials.append(materials[part['material']])
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    transform = Matrix.Translation(Vector(device['position'])) @ Euler(device['rotation'], 'XYZ').to_matrix().to_4x4()
    transform @= Matrix.Translation(Vector(part['position'])) @ Euler(part['rotation'], 'XYZ').to_matrix().to_4x4()
    obj.matrix_world = CONVERSION @ transform @ CONVERSION.inverted()
    for key, value in {'deviceId': device['id'], 'roomId': device['roomId'], 'floor': 'Site' if outdoor else 'Ground', 'luxuryDevice': True, 'gasFixture': True, 'devicePart': part['name'], 'deviceRole': part['role'], 'runtimeDynamic': part['role'] != 'static'}.items():
        obj[key] = value
    if outdoor:
        obj['landscape'] = True
    if part['shape'] == 'box':
        bevel = obj.modifiers.new('Soft fixture edge', 'BEVEL')
        bevel.width = min(part['size']) * .12
        bevel.segments = 1
        bevel.harden_normals = True
    if part['role'] == 'display':
        material = obj.data.materials[0].copy()
        shader = material.node_tree.nodes.get('Principled BSDF')
        shader.inputs['Emission Color'].default_value = (*linear_color('#81B6AC'), 1)
        shader.inputs['Emission Strength'].default_value = .3
        obj.data.materials[0] = material
    return obj


def main():
    """Save a new editable master and verify no original mesh, transform or source byte changed."""
    parser = ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args(sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else [])
    if args.source.resolve() == args.output.resolve() or args.output.exists():
        raise ValueError('Choose a new output path; existing Blender files are preserved.')
    source_hash = hashlib.sha256(args.source.read_bytes()).hexdigest()
    data = Path(__file__).resolve().parents[1] / 'packages/home-scene/src'
    manifest = json.loads((data / 'house-manifest.json').read_text())
    library = json.loads((data / 'device-geometry.json').read_text())
    bpy.ops.wm.open_mainfile(filepath=str(args.source))
    if any(obj.get('deviceId') in DEVICE_IDS for obj in bpy.data.objects):
        raise ValueError('This master already contains gas fixtures; use the unchanged source master.')
    originals = {obj.name: (obj.data, obj.matrix_world.copy()) for obj in bpy.data.objects}
    material_ids = {part['material'] for device_id in DEVICE_IDS for part in library['devices'][device_id]['parts']}
    materials = {key: create_material(key, library['materials'][key]) for key in sorted(material_ids)}
    report = {}
    for scene in bpy.data.scenes:
        if not scene.name.startswith(('01 -', '02 -')):
            continue
        complete = scene.name.startswith('01 -')
        collection = bpy.data.collections.new('Gas service devices - ' + scene.name)
        scene.collection.children.link(collection)
        report[scene.name] = 0
        for device in manifest['devices']:
            if device['id'] not in DEVICE_IDS or (device['id'] == 'utility-gas-meter' and not complete):
                continue
            for index, part in enumerate(library['devices'][device['id']]['parts']):
                create_part(collection, device, part, index, materials, device['roomId'] == 'grounds')
                report[scene.name] += 1
    for name, (mesh, matrix) in originals.items():
        obj = bpy.data.objects[name]
        if obj.data != mesh or obj.matrix_world != matrix:
            raise ValueError(f'An existing object changed: {name}')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output), compress=True)
    if hashlib.sha256(args.source.read_bytes()).hexdigest() != source_hash:
        raise ValueError('The source Blender file unexpectedly changed.')
    print('GAS_SOURCE_COMPLETE=' + json.dumps({'output': str(args.output), 'sourceUnchanged': True, 'addedParts': report}), flush=True)


if __name__ == '__main__':
    main()
