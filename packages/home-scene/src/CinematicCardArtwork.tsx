import { useState, type ReactNode } from 'react';
import type { ArtworkKey } from './cinematicArtwork';
import { cinematicArtworkAssets } from './cinematicArtworkAssets';
import './cinematic-artwork.css';

interface CinematicArtworkProps {
  artwork: ArtworkKey;
  presentation?: 'backdrop' | 'thumbnail' | 'identity';
  children?: ReactNode;
}

/** Decorative packaged artwork never represents device state or a camera feed. */
export function CinematicArtwork({ artwork, presentation = 'backdrop', children }: CinematicArtworkProps) {
  const [failedArtwork, setFailedArtwork] = useState<ArtworkKey | null>(null);
  return <span className={`cinematic-artwork cinematic-artwork--${presentation}`} data-artwork={artwork} aria-hidden="true">
    {failedArtwork !== artwork && <img src={cinematicArtworkAssets[artwork]} alt="" decoding="async" loading="lazy" draggable={false} onError={() => setFailedArtwork(artwork)} />}
    <span className="cinematic-artwork-shade" />
    {children && <span className="cinematic-artwork-symbol">{children}</span>}
  </span>;
}
