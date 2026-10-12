#!/usr/bin/env python3
"""Render the approved VantaHome mark as a deterministic two-second assembly.

Run with Blender 5.2+: blender -b --python scripts/render-arrival-assembly.py -- \
  --output /path/to/work/brand-motion/assembly [--sample | --render]
The approved raster master is reference only; no image editing or AI generation
is used. All visible geometry, materials and animation are authored here.
"""
import argparse
import math
import sys
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector

SIZE = (1024, 768)
FPS = 30
MASTER_SCALE = 500.0
BACKGROUND = (5 / 255, 6 / 255, 18 / 255)


def linear(value: float) -> float:
    """Convert an sRGB channel to linear light for the exact navy background."""
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def material(name: str, color: tuple, metal: float = 0.0, rough: float = 0.3,
             transmission: float = 0.0, emission: float = 0.0):
    """Build a controlled polished-metal/crystal material with optional light."""
    item = bpy.data.materials.new(name)
    item.diffuse_color = (*color, 1)
    item.use_nodes = True
    shader = item.node_tree.nodes.get("Principled BSDF")
    shader.inputs["Base Color"].default_value = (*color, 1)
    shader.inputs["Metallic"].default_value = metal
    shader.inputs["Roughness"].default_value = rough
    shader.inputs["IOR"].default_value = 1.5
    shader.inputs["Transmission Weight"].default_value = transmission
    shader.inputs["Coat Weight"].default_value = 0.5
    shader.inputs["Coat Roughness"].default_value = 0.15
    shader.inputs["Emission Color"].default_value = (*color, 1)
    shader.inputs["Emission Strength"].default_value = emission
    return item


def point(x: float, image_y: float, depth: float = -0.15) -> tuple:
    """Map measured approved-master coordinates into the icon's X/Z plane."""
    return ((x - 627) / MASTER_SCALE, depth, (627 - image_y) / MASTER_SCALE)


def extruded(name: str, outline: list, depth: float, front: float, face, bevel, parent=None):
    """Create a closed, beveled solid from a measured concave icon silhouette."""
    vertices = [point(x, y, front) for x, y in outline]
    vertices += [point(x, y, front + depth) for x, y in outline]
    count = len(outline)
    faces = [tuple(range(count - 1, -1, -1)), tuple(range(count, count * 2))]
    faces += [(index, (index + 1) % count, (index + 1) % count + count, index + count)
              for index in range(count)]
    mesh = bpy.data.meshes.new(name + " geometry")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(mesh)
    bm.free()
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(face)
    obj.data.materials.append(bevel)
    modifier = obj.modifiers.new("Precision crystal bevel", "BEVEL")
    modifier.width = 0.035
    modifier.segments = 3
    modifier.material = 1
    obj.modifiers.new("Weighted face normals", "WEIGHTED_NORMAL")
    if parent:
        obj.parent = parent
    return obj


def rounded_badge(name: str, width: float, height: float, radius: float,
                  depth: float, front: float, face, bevel):
    """Make a true rounded-square shell rather than beveling every cube edge."""
    outline = []
    for center_x, center_z, begin in [
        (width/2-radius, height/2-radius, 0),
        (-width/2+radius, height/2-radius, 90),
        (-width/2+radius, -height/2+radius, 180),
        (width/2-radius, -height/2+radius, 270),
    ]:
        for step in range(13):
            angle = math.radians(begin + step * 90/12)
            x = center_x + radius * math.cos(angle)
            z = center_z + radius * math.sin(angle)
            outline.append((627 + x*MASTER_SCALE, 627-z*MASTER_SCALE))
    return extruded(name, outline, depth, front, face, bevel)


def curve(name: str, coordinates: list, radius: float, mat, parent=None):
    """Draw a beveled circuit trace or rim as actual three-dimensional geometry."""
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = radius
    data.bevel_resolution = 3
    spline = data.splines.new("POLY")
    spline.points.add(len(coordinates)-1)
    for target, coordinate in zip(spline.points, coordinates):
        target.co = (*coordinate, 1)
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    if parent:
        obj.parent = parent
    return obj


def ring(name: str, center: tuple, radius: float, thickness: float, mat, parent=None):
    """Make a smooth, front-facing circular core ring in the X/Z plane."""
    coordinates = [(center[0] + math.cos(i*2*math.pi/96)*radius,
                    center[1], center[2] + math.sin(i*2*math.pi/96)*radius)
                   for i in range(97)]
    return curve(name, coordinates, thickness, mat, parent)


def empty(name: str):
    """Return an assembly root so its physical parts share one animation."""
    obj = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(obj)
    return obj


def light(name: str, position: tuple, power: float, color: tuple, size: float,
          target: tuple = (0, 0, 0)):
    """Place a soft studio light without animating the house or camera."""
    data = bpy.data.lights.new(name, "AREA")
    data.energy = power
    data.color = color
    data.shape = "DISK"
    data.size = size
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = position
    obj.rotation_euler = (Vector(target)-obj.location).to_track_quat("-Z", "Y").to_euler()
    return obj


def location_keys(obj, values: list) -> None:
    """Seat an assembly with explicit, short settling keys; never shake the camera."""
    for frame, location in values:
        obj.location = location
        obj.keyframe_insert("location", frame=frame)


def emission_keys(mat, values: list) -> None:
    """Stage activation after the parts seat, then make a small cyclic hold pulse."""
    socket = mat.node_tree.nodes.get("Principled BSDF").inputs["Emission Strength"]
    for frame, value in values:
        socket.default_value = value
        socket.keyframe_insert("default_value", frame=frame)


def configure() -> None:
    """Create a deterministic EEVEE studio with a restrained physical highlight."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.eevee.taa_render_samples = 48
    scene.eevee.use_raytracing = True
    scene.render.resolution_x, scene.render.resolution_y = SIZE
    scene.render.resolution_percentage = 100
    scene.render.fps = FPS
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.view_settings.view_transform = "Standard"
    scene.view_settings.look = "None"
    scene.view_settings.exposure = -0.6
    scene.view_settings.gamma = 1.0
    scene.world.use_nodes = True
    world = scene.world.node_tree.nodes.get("Background")
    world.inputs["Color"].default_value = (*[linear(c) for c in BACKGROUND], 1)
    # Compensate the exposure only on the backdrop so its delivered navy is exact.
    world.inputs["Strength"].default_value = 2**0.6
    scene.render.film_transparent = False
    node_group = bpy.data.node_groups.new("Arrival glow compositor", "CompositorNodeTree")
    node_group.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    layers = node_group.nodes.new("CompositorNodeRLayers")
    glow = node_group.nodes.new("CompositorNodeGlare")
    glow.inputs["Type"].default_value = "Fog Glow"
    glow.inputs["Quality"].default_value = "High"
    glow.inputs["Threshold"].default_value = 1.0
    glow.inputs["Strength"].default_value = 0.16
    glow.inputs["Size"].default_value = 0.22
    output = node_group.nodes.new("NodeGroupOutput")
    node_group.links.new(layers.outputs["Image"], glow.inputs["Image"])
    node_group.links.new(glow.outputs["Image"], output.inputs["Image"])
    scene.compositing_node_group = node_group
    camera_data = bpy.data.cameras.new("Stationary product camera")
    camera = bpy.data.objects.new("Stationary product camera", camera_data)
    bpy.context.collection.objects.link(camera)
    camera.location = (2.05, -10, 0.38)
    camera.rotation_euler = (Vector((0, 0, 0))-camera.location).to_track_quat("-Z", "Y").to_euler()
    camera_data.type = "ORTHO"
    camera_data.ortho_scale = 3.65
    scene.camera = camera
    light("Lavender key", (-3, -4, 4), 300, (0.68, 0.42, 1.0), 4)
    light("Violet edge", (2, -2, 1.7), 180, (0.5, 0.14, 1), 2.4)
    light("Cool architectural rim", (3, 0, -1), 220, (0.12, 0.27, 1), 2.5)
    light("Soft white bevel definition", (-1, -4, 0.5), 35, (0.85, 0.8, 1), 1.8)


def build_scene() -> None:
    """Author the stationary house, then animate only the V and its circuit core."""
    configure()
    obsidian = material("Obsidian glass body", (0.002, 0.0015, 0.009), 0.0, 0.42)
    dark_shader=obsidian.node_tree.nodes.get("Principled BSDF")
    dark_shader.inputs["Specular IOR Level"].default_value=0.0
    dark_shader.inputs["Coat Weight"].default_value=0.0
    dark_edge = material("Smoked amethyst badge bevel", (0.08, 0.016, 0.16), 0.72, 0.2)
    purple = material("Satin amethyst titanium", (0.23, 0.045, 0.55), 0.58, 0.24)
    bevel = material("Faceted lavender crystal", (0.48, 0.17, 0.82), 0.35, 0.18, 0.18)
    blue = material("Blue violet house body", (0.055, 0.019, 0.18), 0.7, 0.19)
    core_metal = material("Core violet titanium", (0.23, 0.025, 0.6), 0.55, 0.2)
    traces = material("Circuit activation", (0.49, 0.1, 1), 0.25, 0.22, emission=0.02)
    energy = material("Core energy", (0.34, 0.07, 1), 0.15, 0.16, emission=0.03)
    white_energy=material("White-hot energy center",(1,0.83,1),0.0,0.13,emission=0.01)
    rim = material("Shell light seam", (0.34, 0.065, 0.92), 0.5, 0.23, emission=0.015)
    rounded_badge("Stationary rounded obsidian badge", 2.38, 2.38, 0.4, 0.16, 0.05, obsidian, dark_edge)
    rounded_badge("Stationary recessed inset", 2.23, 2.23, 0.34, 0.015, 0.022, obsidian, dark_edge)
    roof = [(228,590),(625,198),(837,405),(837,285),(916,285),
            (918,482),(1025,590),(939,590),(625,282),(317,590)]
    roof_obj=extruded("Stationary roof and right chimney", roof, 0.18, -0.155, purple, bevel)
    roof_obj.modifiers["Precision crystal bevel"].width=0.038
    roof_obj.modifiers["Precision crystal bevel"].segments=3
    body = [(297,596),(378,596),(378,916),(397,942),(850,942),(873,919),
            (873,596),(947,596),(947,956),(921,997),(338,997),(297,964)]
    extruded("Stationary U-shaped house", body, 0.11, -0.11, blue, bevel)
    v_root = empty("V arrival assembly")
    v_shape = [(305,610),(428,610),(625,951),(826,610),(946,610),(665,1073),(593,1073)]
    v_obj=extruded("Solid V", v_shape, 0.20, -0.25, purple, bevel, v_root)
    v_obj.modifiers["Precision crystal bevel"].width=0.045
    v_obj.modifiers["Precision crystal bevel"].segments=3
    core = empty("Circuit core arrival assembly")
    core_center = point(627,675,-0.29)
    ring("Core outer titanium ring", core_center, 0.191, 0.021, core_metal, core)
    ring("Core crystalline ring", (core_center[0],-0.325,core_center[2]), 0.153, 0.013, bevel, core)
    ring("Core luminous inner orbit", (core_center[0],-0.34,core_center[2]), 0.128, 0.006, traces, core)
    ring("Core outer luminous seam", (core_center[0],-0.316,core_center[2]), 0.198, 0.004, traces, core)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=40, ring_count=20, radius=0.093, location=(0,-0.33,core_center[2]))
    globe = bpy.context.object
    globe.name = "Dimensional energy lens"
    globe.scale = (1,0.45,1)
    globe.data.materials.append(energy)
    globe.parent = core
    for polygon in globe.data.polygons:
        polygon.use_smooth = True
    bpy.ops.mesh.primitive_uv_sphere_add(segments=32,ring_count=16,radius=0.044,
                                       location=(0,-0.38,core_center[2]))
    hot_center=bpy.context.object
    hot_center.name="White energy nucleus"
    hot_center.scale=(1,0.4,1)
    hot_center.data.materials.append(white_energy)
    hot_center.parent=core
    for polygon in hot_center.data.polygons:
        polygon.use_smooth=True
    for name, line, end in [
        ("North", [(627,583),(627,434)], (627,418)),
        ("West", [(562,610),(489,543),(477,543)], (463,543)),
        ("East", [(692,610),(760,543),(777,543)], (791,543)),
        ("South", [(627,770),(627,846)], (627,862)),
    ]:
        curve(name+" circuit", [point(x,y,-0.31) for x,y in line], 0.0045, traces, core)
        center = point(*end,-0.314)
        ring(name+" terminal", center, 0.028, 0.005, traces, core)
    # The shell's light seam remains physically fixed throughout both clips.
    border = []
    for cx,cz,start in [(0.775,0.775,0),(-0.775,0.775,90),
                        (-0.775,-0.775,180),(0.775,-0.775,270)]:
        for step in range(17):
            angle=math.radians(start+step*90/16)
            border.append((cx+0.395*math.cos(angle),-0.006,cz+0.395*math.sin(angle)))
    border.append(border[0])
    curve("Stationary violet seam", border, 0.0035, rim)
    location_keys(v_root, [(1,(0,-1.3,3.2)),(5,(0,-1.3,3.2)),
                          (8,(0,-0.72,1.7)),(17,(0,0.012,-0.016)),
                          (19,(0,-0.025,0.018)),(21,(0,0,0)),(119,(0,0,0))])
    location_keys(core, [(1,(0,-1.2,3.2)),(22,(0,-1.2,3.2)),
                        (25,(0,-0.65,1.6)),(34,(0,0.01,-0.013)),
                        (36,(0,-0.014,0.01)),(38,(0,0,0)),(119,(0,0,0))])
    emission_keys(energy, [(1,.025),(34,.025),(37,1.8),(43,5.0),(49,3.0),
                           (60,2.5),(89,2.62),(119,2.5)])
    emission_keys(white_energy,[(1,.01),(34,.01),(37,3.5),(43,8),(49,5),
                                (60,4),(89,4.25),(119,4)])
    emission_keys(traces, [(1,.018),(35,.018),(39,1.8),(45,2.6),(53,1.15),
                           (60,1.15),(89,1.22),(119,1.15)])
    emission_keys(rim, [(1,.015),(38,.015),(46,.85),(52,.32),
                        (60,.19),(89,.21),(119,.19)])
    scene=bpy.context.scene
    scene.frame_start=1
    scene.frame_end=119
    scene.frame_set(60)


def main() -> None:
    """Save the editable scene and render requested contact samples or frame sets."""
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output",type=Path,required=True)
    parser.add_argument("--sample",action="store_true")
    parser.add_argument("--render",action="store_true")
    args=parser.parse_args(sys.argv[sys.argv.index("--")+1:] if "--" in sys.argv else [])
    args.output.mkdir(parents=True,exist_ok=True)
    build_scene()
    scene=bpy.context.scene
    bpy.ops.wm.save_as_mainfile(filepath=str(args.output/"vantahome-assembly.blend"))
    if args.sample:
        for frame,label in [(1,"shell"),(60,"assembled")]:
            scene.frame_set(frame)
            scene.render.filepath=str(args.output/f"sample-{label}.png")
            bpy.ops.render.render(write_still=True)
    if args.render:
        frames=args.output/"frames"
        frames.mkdir(exist_ok=True)
        scene.render.filepath=str(frames/"frame-")
        bpy.ops.render.render(animation=True)


if __name__=="__main__":
    main()
