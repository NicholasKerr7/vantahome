import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CinematicViewControl } from './CinematicViewControl';

const playback = vi.hoisted(() => ({ showcase: false, setShowcase: vi.fn() }));
vi.mock('./cinematicStore', () => ({
  useCinematicStore: (select: (state: typeof playback) => unknown) => select(playback),
}));

beforeEach(() => { playback.showcase = false; playback.setShowcase.mockClear(); });

describe('cinematic camera control', () => {
  it('offers explicit opt-in playback and identifies its independent input control', () => {
    const markup = renderToStaticMarkup(<CinematicViewControl reducedMotion={false} immersive={false} unavailable={false} />);
    expect(markup).toContain('aria-label="Start cinematic view"');
    expect(markup).toContain('data-cinematic-control="true"');
    expect(markup).toContain('aria-pressed="false"');
    expect(markup).not.toContain('disabled');
  });

  it.each([
    ['reduced motion', { reducedMotion: true, immersive: false, unavailable: false }, 'motion preference'],
    ['immersive view', { reducedMotion: false, immersive: true, unavailable: false }, 'Choose landscape or a floor plan'],
    ['unavailable scene', { reducedMotion: false, immersive: false, unavailable: true }, 'when the scene is ready'],
  ])('prevents starting during %s and explains why', (_name, props, explanation) => {
    const markup = renderToStaticMarkup(<CinematicViewControl {...props} />);
    expect(markup).toContain('disabled');
    expect(markup).toContain(explanation);
  });

  it('keeps stop available while runtime is responding to a changed motion preference', () => {
    playback.showcase = true;
    const markup = renderToStaticMarkup(<CinematicViewControl reducedMotion immersive={false} unavailable={false} />);
    expect(markup).toContain('aria-label="Stop cinematic view"');
    expect(markup).toContain('aria-pressed="true"');
    expect(markup).not.toContain('disabled');
  });
});
