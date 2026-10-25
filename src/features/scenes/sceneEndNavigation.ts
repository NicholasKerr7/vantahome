import type { NavigationAction } from '@react-navigation/native';
import { openHomeFeature } from '../../app/homeNavigation';
import { useHomeStore } from '../../store/useHomeStore';
import { modelSceneCatalog } from '../three-d-home/modelSceneCatalog';

/** Open a review for the current visible scene; this navigation never changes device settings. */
export function openSceneEndReview(dispatch: (action: NavigationAction) => void, sceneId: string): boolean {
  const state = useHomeStore.getState();
  if (state.authTaskBlockingHome) return false;
  const catalog = modelSceneCatalog(state);
  if (catalog.activeSceneId !== sceneId || !catalog.scenes.some((scene) => scene.id === sceneId)) return false;
  openHomeFeature(dispatch, 'Scenes', { sceneEndId: sceneId });
  return true;
}
