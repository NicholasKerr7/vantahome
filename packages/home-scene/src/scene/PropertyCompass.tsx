import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { projectSiteCardinal, SITE_CARDINALS, type SiteCardinal } from './siteOrientation';
import './property-compass.css';

export type CompassMarkers = Partial<Record<SiteCardinal['label'], SVGGElement | null>>;
interface CompassProps { markers: RefObject<CompassMarkers> }

/** One DOM-owned SVG avoids additional React roots during scene loading or teardown. */
export function PropertyCompass({ markers }: CompassProps) {
  return <svg className="property-compass-overlay" role="img" aria-label="Property compass. Approximate orientation based on the A002 site-plan north arrow.">
    {SITE_CARDINALS.map(({ label, name }) => <g key={label}
      ref={(element) => { markers.current[label] = element; }}
      className={`property-cardinal${label === 'N' ? ' is-north' : ''}`}
      data-cardinal={label} visibility="hidden" aria-hidden="true">
      <title>{name} · Based on site plan</title>
      <text x="0" y={label === 'N' ? -5 : 0}>{label}</text>
      {label === 'N' && <text className="property-cardinal-note" x="0" y="10">PLAN</text>}
    </g>)}
  </svg>;
}

/** Project live bearings into SVG attributes without frame-by-frame React renders or CSS styles. */
export function PropertyCompassProjection({ markers, enabled }: CompassProps & { enabled: boolean }) {
  useFrame(({ camera, size }) => {
    if (!enabled) return;
    for (const { label, bearing } of SITE_CARDINALS) {
      const marker = markers.current[label];
      if (!marker) continue;
      const [x, y] = projectSiteCardinal(bearing, camera, size);
      const transform = `translate(${x.toFixed(2)} ${y.toFixed(2)})`;
      if (marker.getAttribute('transform') !== transform) marker.setAttribute('transform', transform);
      if (marker.getAttribute('visibility') !== 'visible') marker.setAttribute('visibility', 'visible');
    }
  });
  return null;
}
