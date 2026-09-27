import { Mesh, MeshStandardMaterial, SpotLight, type Object3D } from 'three';
import { SOLAR_LIGHT_CONE, SOLAR_LIGHT_RADIUS, SOLAR_LIGHT_RIG } from './solarLighting';

export interface SolarLamp {
  light: SpotLight;
  material: MeshStandardMaterial;
}

/** Attach four inward warm pools to the matching live diffusers, without shadow maps. */
export function createSolarLights(model: Object3D): SolarLamp[] {
  return SOLAR_LIGHT_RIG.map((rig) => {
    const fixture = model.getObjectByName(`lab-light-${rig.id}`);
    if (!(fixture instanceof Mesh) || !(fixture.material instanceof MeshStandardMaterial)) {
      throw new Error(`The solar model is missing the ${rig.id} diffuser.`);
    }
    const light = new SpotLight('#ffdda7', 0, SOLAR_LIGHT_RADIUS, SOLAR_LIGHT_CONE[1], 1, 2);
    light.name = `${rig.id}-downlight`;
    light.position.fromArray(rig.position);
    light.target.position.fromArray(rig.target);
    light.castShadow = false;
    model.add(light, light.target);
    return { light, material: fixture.material };
  });
}

/** Solar lamps follow dusk independently of the bedroom lighting control. */
export function setSolarNight(lamps: SolarLamp[], night: boolean): void {
  for (const { light, material } of lamps) {
    light.intensity = night ? 64 : 0;
    material.emissiveIntensity = night ? 1.5 : 0;
  }
}
