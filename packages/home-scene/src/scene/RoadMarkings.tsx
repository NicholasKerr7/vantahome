import { useEffect, useMemo } from 'react';
import { createRoadMarkingGeometry } from './roadMarkingGeometry';

/** Add restrained, shadow-receiving road paint without moving the authored property. */
export function RoadMarkings() {
  const geometry = useMemo(createRoadMarkingGeometry, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh name="property-road-markings" geometry={geometry} receiveShadow raycast={() => null}>
    <meshStandardMaterial color="#deded4" roughness={0.96} metalness={0} polygonOffset polygonOffsetFactor={-1} polygonOffsetUnits={-1} />
  </mesh>;
}
