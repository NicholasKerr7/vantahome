import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import { PMREMGenerator } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/** Bake a small local reflection environment once, without downloading an HDR image. */
export function MaterialEnvironment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const generator = new PMREMGenerator(gl);
    const studio = new RoomEnvironment();
    const environment = generator.fromScene(studio, 0.04);
    const previous = scene.environment;
    scene.environment = environment.texture;
    studio.dispose();
    generator.dispose();
    return () => {
      scene.environment = previous;
      environment.dispose();
    };
  }, [gl, scene]);
  return null;
}
