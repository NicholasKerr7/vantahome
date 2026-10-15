import { describe, expect, it } from 'vitest';
import siteLayout from '../site-layout.json';
import publicSiteLayout from '../../public/models/site-layout.json';
import { geographicBearingDirection, windTravelDirection } from './propertyGeography';

describe('official property geography', () => {
  it('aligns the official true frontage bearing to the unchanged model frontage', () => {
    const [start, end] = siteLayout.parcel.vertices;
    const dx = end[0] - start[0];
    const dz = start[1] - end[1]; // Plan Y maps to negative runtime Z.
    const length = Math.hypot(dx, dz);
    const direction = geographicBearingDirection(siteLayout.orientation.frontageTrueBearingDegrees);
    expect(direction[0]).toBeCloseTo(dx / length, 10);
    expect(direction[1]).toBeCloseTo(dz / length, 10);
    expect(publicSiteLayout).toEqual(siteLayout);
  });

  it.each([0, 45, 90, 135, 180, 225, 270, 315])('moves wind FROM %s degrees toward the opposite compass marker', (bearing) => {
    const source = geographicBearingDirection(bearing);
    const destination = geographicBearingDirection(bearing + 180);
    const travel = windTravelDirection(bearing);
    expect(travel[0]).toBeCloseTo(destination[0], 12);
    expect(travel[1]).toBeCloseTo(destination[1], 12);
    expect(travel[0] * source[0] + travel[1] * source[1]).toBeCloseTo(-1, 12);
    expect(Math.hypot(...travel)).toBeCloseTo(1, 12);
  });

  it('treats full turns and negative provider bearings consistently', () => {
    for (const bearing of [0, 75.5, 180, 270]) {
      expect(geographicBearingDirection(bearing + 720)).toEqual(geographicBearingDirection(bearing));
      expect(windTravelDirection(bearing - 720)).toEqual(windTravelDirection(bearing));
    }
  });

  it.each([Number.NaN, Infinity, -Infinity])('keeps invalid bearing %s deterministic and finite', (bearing) => {
    expect(geographicBearingDirection(bearing)).toEqual(geographicBearingDirection(0));
    expect(windTravelDirection(bearing)).toEqual(windTravelDirection(0));
  });
});
