import { useMemo } from 'react';
import { useFilamentContext, useWorkletEffect, type FilamentAsset, type Float4 } from 'react-native-filament';
import type { WeatherKind } from '../../../packages/home-scene/src/renderer-lab/weather';

// These named GLB primitives use glTF's metallic/roughness material. Restricting
// the selection avoids changing windows, indoor floors, lawns, or device bodies.
const SURFACE_NAMES = {
  house: ['roof--clay', 'roof--claydark', 'roof--claylight'],
  landscape: ['landscape-Site Access', 'landscape-Site Path', 'landscape-Site Paving', 'landscape-Site Road'],
};

/** Wet only audited outdoor materials and restore their exact dry parameters. */
export function useFilamentWetSurfaces(asset: FilamentAsset | undefined, kind: string, weather: WeatherKind) {
  const { renderableManager } = useFilamentContext();
  const surfaces = useMemo(() => {
    if (!asset || (kind !== 'house' && kind !== 'landscape')) return [];
    return SURFACE_NAMES[kind].flatMap((name) => {
      const entity = asset.getFirstEntityByName(name);
      if (!entity) return [];
      const material = renderableManager.getMaterialInstanceAt(entity, 0);
      return [{ material, roughness: material.getFloatParameter('roughnessFactor'),
        color: material.getFloat4Parameter('baseColorFactor') }];
    });
  }, [asset, kind, renderableManager]);
  const wetness = weather === 'clear' ? 0 : weather === 'light' ? 0.42 : weather === 'heavy' ? 0.8 : 1;
  useWorkletEffect(() => {
    'worklet';
    surfaces.forEach(({ material, roughness, color }) => {
      material.setFloatParameter('roughnessFactor', roughness + (0.24 - roughness) * wetness);
      const shade = 1 - 0.2 * wetness;
      const wetColor: Float4 = [color[0] * shade, color[1] * shade, color[2] * shade, color[3]];
      // Both parameters and their scalar/float4 types are defined by glTF's lit shader.
      material.setFloat4Parameter('baseColorFactor', wetColor);
    });
  });
}
