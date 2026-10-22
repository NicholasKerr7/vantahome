import { useEffect, useRef } from 'react';
import { useScenePreviewStore } from './scenePreviewStore';
import './scene-preview.css';

/** Send a local presentation intent to the lifecycle owner, never to the simulation bridge. */
function present(action: 'current' | 'proposed' | 'exit'): void {
  window.dispatchEvent(new CustomEvent('vantahome-preview-toolbar', { detail: action }));
}

/** Persistent, touch-sized comparison controls make the temporary rendering unambiguous. */
export function ScenePreviewToolbar() {
  const active = useScenePreviewStore((state) => state.active);
  const comparison = useScenePreviewStore((state) => state.comparison);
  const region = useRef<HTMLElement>(null);
  useEffect(() => { if (active) region.current?.focus({ preventScroll: true }); }, [active?.id]);
  if (!active) return null;
  return <section ref={region} tabIndex={-1} className="scene-preview-toolbar" aria-label="Scene proposal preview">
    <div className="scene-preview-caption" role="status">
      <span className="scene-preview-badge">Preview · no device changes</span>
      <strong>{active.payload.title}</strong>
    </div>
    <div className="scene-preview-actions">
      <div className="scene-preview-compare" role="group" aria-label="Compare scene appearance">
        <button type="button" aria-pressed={comparison === 'current'} onClick={() => present('current')}>Current</button>
        <button type="button" aria-pressed={comparison === 'proposed'} onClick={() => present('proposed')}>Proposed</button>
      </div>
      <button type="button" className="scene-preview-exit" onClick={() => present('exit')}>Exit preview</button>
    </div>
  </section>;
}
