import { FULL_SCENE_ACCESS, canExploreInteriorLayout, canViewSceneDevice } from '../sceneAccess';
import { memo, useMemo, useRef, type RefObject } from 'react';
import { RoundedBox } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Group, MathUtils } from 'three';
import {
  DEVICES,
  getRoom,
  type DeviceDefinition,
} from '../data';
import { gasStatusTone } from '../gasSimulation';
import { hotspotPresentation } from '../hotspotPresentation';
import type { DeviceState } from '../state';
import { Hotspot } from './Hotspot';
import { DeviceEffects } from './DeviceEffects';
import {
  FIXTURE_LIBRARY,
  type FixtureGeometry,
  type FixturePart,
  type VectorTuple,
} from './deviceGeometry';
import { UPPER_ELEVATION, readDevice, type HouseSceneProps } from './types';
import { usePageMotion } from './usePageMotion';
import { openingFraction, shutterPose } from './deviceMotion';
import { BLINDS_GEOMETRY, getBlindsPose } from '../blinds';
import { readLabLightState } from '../lightAppearance';
import type { LabLightState } from '../renderer-lab/lightStates';

type DeviceProps = Pick<
  HouseSceneProps,
  | 'view'
  | 'floor'
  | 'roomId'
  | 'deviceStates'
  | 'selectedDevice'
  | 'quickDeviceId'
  | 'hotspotControlMode'
  | 'access'
  | 'reducedMotion'
  | 'onSelectDevice'
>;
const SYMBOLS: Record<string, string> = {
  light: '✧',
  fan: '✣',
  tv: '▣',
  washer: '◉',
  dryer: '◉',
  ac: '❄',
  blinds: '▤',
  gate: '▥',
  garage: '▥',
  door: '▯',
  window: '⊞',
  camera: '◉',
  speaker: '♫',
  solar: '☀',
  battery: '▰',
  generator: 'ϟ',
  energy: 'ϟ',
  water: '◒',
  'water-heater': '♨',
  smoke: '◌',
  'gas-meter': '◴',
  'gas-leak': '◇',
  air: '≈',
  sprinkler: '⤨',
  coffee: '☕',
  fridge: '▯',
  stove: '◉',
  dishwasher: '▤',
  microwave: '▣',
  vacuum: '◎',
};

/** Use the same dimensioned primitive and material description as the Blender source. */
function FixturePartMesh({
  part,
  state,
  light,
  indicatorColor,
  offset = [0, 0, 0],
}: {
  part: FixturePart;
  state: DeviceState;
  light?: LabLightState;
  indicatorColor?: string;
  offset?: VectorTuple;
}) {
  const surface = FIXTURE_LIBRARY.materials[part.material];
  const glow = part.role === 'glow' || part.role === 'display';
  const color = glow
    ? state.on
      ? part.role === 'display'
        ? indicatorColor ?? '#a8d5bb'
        : light?.colorHex ?? '#ffe2ad'
      : '#44483f'
    : surface.color;
  const material = (
    <meshStandardMaterial
      color={color}
      roughness={surface.roughness}
      metalness={surface.metalness}
      transparent={(surface.opacity ?? 1) < 1}
      opacity={surface.opacity ?? 1}
      emissive={glow ? color : '#000000'}
      emissiveIntensity={
        glow && state.on
          ? (part.role === 'display'
              ? Math.max(0.18, state.level / 100)
              : (light?.brightness ?? state.level) / 100) * 1.35
          : 0
      }
      toneMapped={!glow}
      side={surface.opacity ? 2 : 0}
    />
  );
  const position: VectorTuple = [
    part.position[0] - offset[0],
    part.position[1] - offset[1],
    part.position[2] - offset[2],
  ];
  if (part.shape === 'box')
    return (
      <RoundedBox
        args={part.size}
        radius={Math.min(...part.size) * 0.12}
        smoothness={1}
        bevelSegments={1}
        position={position}
        rotation={part.rotation}
        castShadow={!glow}
        receiveShadow
      >
        {material}
      </RoundedBox>
    );
  return (
    <mesh
      position={position}
      rotation={part.rotation}
      scale={part.size}
      castShadow={!glow}
      receiveShadow
    >
      {part.shape === 'cylinder' ? (
        <cylinderGeometry args={[0.5, 0.5, 1, 20]} />
      ) : (
        <sphereGeometry args={[0.5, 16, 10]} />
      )}
      {material}
    </mesh>
  );
}

/** Apply opening poses to grouped parts without changing their catalog anchor. */
function MovingAssembly({
  parts,
  geometry,
  device,
  state,
  reducedMotion,
  canAnimate,
}: {
  parts: FixturePart[];
  geometry: FixtureGeometry;
  device: DeviceDefinition;
  state: DeviceState;
  reducedMotion: boolean;
  canAnimate: RefObject<boolean>;
}) {
  const root = useRef<Group>(null);
  const rotor = useRef<Group>(null);
  const cover = useRef<Group>(null);
  const door = useRef<Group>(null);
  const window = useRef<Group>(null);
  const robot = useRef<Group>(null);
  const slats = useRef<Group>(null);
  const openness = useRef(state.level / 100);
  const speed = useRef(0);
  const elapsed = useRef(0);
  const pivot: VectorTuple = geometry.pivot ?? [
    0,
    device.dimensions[1] * 0.4,
    0,
  ];
  const groups = useMemo(
    () =>
      Object.fromEntries(
        [
          'rotor',
          'door',
          'window',
          'shutter',
          'robot',
          'slat',
          'blindBottom',
        ].map((role) => [role, parts.filter((part) => part.role === role)]),
      ),
    [parts],
  );
  const light = device.kind === 'light' ? readLabLightState(device, state) : undefined;
  const gasTone = gasStatusTone(device.kind, state);
  const indicatorColor = gasTone === 'alarm' ? '#ff7465' : gasTone === 'warning' || gasTone === 'closed' ? '#efd391' : undefined;
  useFrame((_, delta) => {
    if (document.hidden) return;
    const dt = Math.min(delta, 0.07);
    openness.current = reducedMotion
      ? state.level / 100
      : MathUtils.damp(openness.current, state.level / 100, 4, dt);
    const amount = openingFraction(openness.current * 100),
      height = device.dimensions[1];
    if (door.current) door.current.rotation.y = (-Math.PI / 2) * amount;
    if (window.current) window.current.rotation.x = (Math.PI / 3) * amount;
    if (cover.current) {
      const pose = shutterPose(height, amount);
      cover.current.scale.y = pose.scale;
      cover.current.position.y = pose.rise;
    }
    if (slats.current) {
      const pose = getBlindsPose(amount * 100);
      slats.current.children.forEach((part, index) => {
        part.position.y =
          BLINDS_GEOMETRY.firstSlatHeight -
          device.position[1] +
          pose.firstOffset -
          index * pose.gap;
        part.rotation.x = pose.tilt;
      });
    }
    if (root.current) {
      const bottom = root.current.getObjectByName('blind-bottom');
      if (bottom)
        bottom.position.y =
          BLINDS_GEOMETRY.firstSlatHeight -
          device.position[1] +
          getBlindsPose(amount * 100).bottomOffset;
    }
    // Dock is a target pose, so it still applies immediately with reduced motion.
    if (robot.current && groups.robot.length > 0 && !state.on) {
      elapsed.current = 0;
      const remaining = reducedMotion ? 0 : Math.exp(-dt * 4);
      robot.current.position.multiplyScalar(remaining);
      robot.current.rotation.y *= remaining;
    }
    if (canAnimate.current) {
      speed.current = MathUtils.damp(
        speed.current,
        state.on ? state.level * 0.13 : 0,
        2,
        dt,
      );
      if (rotor.current) rotor.current.rotation.y += speed.current * dt;
      if (robot.current && state.on) {
        elapsed.current += dt;
        robot.current.position.set(
          Math.sin(elapsed.current * 0.4) * 0.2,
          0,
          Math.cos(elapsed.current * 0.4) * 0.15 - 0.15,
        );
        robot.current.rotation.y = Math.sin(elapsed.current * 0.4) * 0.4;
      }
    }
  });
  const partMesh = (part: FixturePart, offset?: VectorTuple) => (
    <FixturePartMesh
      key={`${part.role}:${parts.indexOf(part)}:${part.name}`}
      part={part}
      state={state}
      light={light}
      indicatorColor={indicatorColor}
      offset={offset}
    />
  );
  return (
    <group ref={root}>
      {parts
        .filter((part) => part.role === 'glow' || part.role === 'display')
        .map((part) => partMesh(part))}
      <group ref={rotor} position={pivot}>
        {groups.rotor.map((part) => partMesh(part, pivot))}
      </group>
      <group ref={door}>
        {groups.door.map((part) => partMesh(part, [0, 0, 0]))}
      </group>
      <group ref={window} position={[0, device.dimensions[1], 0]}>
        {groups.window.map((part) =>
          partMesh(part, [0, device.dimensions[1], 0]),
        )}
      </group>
      <group ref={cover}>{groups.shutter.map((part) => partMesh(part))}</group>
      <group ref={robot}>{groups.robot.map((part) => partMesh(part))}</group>
      <group ref={slats}>
        {groups.slat.map((part) => (
          <group
            key={`${part.role}:${parts.indexOf(part)}:${part.name}`}
            position={[0, part.position[1], 0]}
          >
            {partMesh({ ...part, rotation: [0, 0, 0] }, [
              0,
              part.position[1],
              0,
            ])}
          </group>
        ))}
      </group>
      {groups.blindBottom.length > 0 && (
        <group name="blind-bottom">
          {groups.blindBottom.map((part) =>
            partMesh(part, [0, part.position[1], 0]),
          )}
        </group>
      )}
    </group>
  );
}

/** Memoize fixture shells so one control update does not rebuild every device subtree. */
const Fixture = memo(function Fixture({
  device,
  state,
  reducedMotion,
  onSelectDevice,
  canAnimate,
}: {
  device: DeviceDefinition;
  state: DeviceState;
  reducedMotion: boolean;
  onSelectDevice: (id: string) => void;
  canAnimate: RefObject<boolean>;
}) {
  const geometry = FIXTURE_LIBRARY.devices[device.id];
  const parts = useMemo(
    () => geometry?.parts.filter((part) => part.role !== 'static') ?? [],
    [geometry],
  );
  return (
    <group
      position={device.position}
      rotation={device.rotation}
      onClick={(event) => {
        event.stopPropagation();
        onSelectDevice(device.id);
      }}
    >
      {geometry && parts.length > 0 && (
        <MovingAssembly
          parts={parts}
          geometry={geometry}
          device={device}
          state={state}
          reducedMotion={reducedMotion}
          canAnimate={canAnimate}
        />
      )}
      <DeviceEffects
        device={device}
        state={state}
        reducedMotion={reducedMotion}
        canAnimate={canAnimate}
      />
    </group>
  );
});

/** Limit projected controls to the chosen room, keeping dense bedroom plans usable. */
export function Devices({
  view,
  floor,
  roomId,
  deviceStates,
  selectedDevice,
  quickDeviceId,
  hotspotControlMode = 'quick',
  access = FULL_SCENE_ACCESS,
  reducedMotion,
  onSelectDevice,
}: DeviceProps) {
  const canAnimate = usePageMotion(reducedMotion);
  const full = view === 'exterior' || view === 'immersive';
  const visible = DEVICES.filter((device) => {
    const room = getRoom(device.roomId);
    if (!canViewSceneDevice(access, device.id)) return false;
    if (view === 'exterior' && !canExploreInteriorLayout(access) && !room.outdoor) return false;
    if (!canExploreInteriorLayout(access) && !full) return device.roomId === roomId;
    return full || (!room.outdoor && room.floor === floor);
  });
  const practical = DEVICES.filter(
    (device) =>
      canViewSceneDevice(access, device.id) && device.roomId === roomId &&
      device.kind === 'light' &&
      device.model !== 'solar-streetlight' &&
      deviceStates[device.id]?.on,
  ).slice(0, 3);
  return (
    <>
      {visible.map((device) => {
        const room = getRoom(device.roomId);
        const elevation = full && room.floor === 'upper' ? UPPER_ELEVATION : 0;
        const state = readDevice(deviceStates, device.id);
        const hotspot = hotspotPresentation(device, state);
        const showHotspot =
          device.roomId === roomId && device.id !== 'entry-gate';
        return (
          <group key={device.id} position={[0, elevation, 0]}>
            <Fixture
              device={device}
              state={state}
              reducedMotion={reducedMotion}
              onSelectDevice={onSelectDevice}
              canAnimate={canAnimate}
            />
            {showHotspot && (
              <Hotspot
                id={device.id}
                label={device.name}
                icon={SYMBOLS[device.kind] ?? '◉'}
                position={device.hotspot}
                on={hotspot.active}
                monitoring={hotspot.monitoring}
                stateLabel={hotspot.stateLabel}
                tone={hotspot.tone}
                selected={selectedDevice === device.id}
                expanded={quickDeviceId === device.id}
                controlMode={hotspotControlMode}
                onSelect={onSelectDevice}
              />
            )}
          </group>
        );
      })}
      {practical.map((device) => {
        const room = getRoom(device.roomId);
        const y = full && room.floor === 'upper' ? UPPER_ELEVATION : 0;
        const light = readLabLightState(device, readDevice(deviceStates, device.id));
        return (
          <pointLight
            key={device.id}
            position={[
              device.position[0],
              device.position[1] + y - 0.08,
              device.position[2],
            ]}
            color={light.colorHex}
            intensity={light.brightness * 0.13}
            distance={device.model === 'table-lamp' ? 2.5 : 6}
            decay={2}
          />
        );
      })}
    </>
  );
}
