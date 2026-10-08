import { canViewPropertyOverview, type SceneAccess } from '../sceneAccess';

/** Enforce live layout authority and motion/lifecycle limits at the rendering boundary. */
export function canPresentCinematic(requested: boolean, access: SceneAccess, reducedMotion: boolean, suspended: boolean): boolean {
  return requested && canViewPropertyOverview(access) && !reducedMotion && !suspended;
}

/** Select only a visual gate transform; no command or simulation state is written. */
export function presentationGateLevel(cinematic: boolean, frameActive: boolean, tourLevel: number, deviceLevel: number): number {
  const level = cinematic && frameActive ? tourLevel : deviceLevel;
  return Number.isFinite(level) ? Math.min(100, Math.max(0, level)) : 0;
}
