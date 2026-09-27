import { runtimeMode, type RuntimeMode } from './runtimeMode';

/** Keep the experimental native renderer behind an explicit preview-only flag. */
export function isRendererLabEnabled(
  configured = process.env.EXPO_PUBLIC_ENABLE_RENDERER_LAB,
  mode: RuntimeMode = runtimeMode,
): boolean {
  return (mode === 'demo' || mode === 'development') && configured === 'true';
}
