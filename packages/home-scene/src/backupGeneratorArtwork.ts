import { ENERGY_ARTWORK_PLINTH, energyArtworkMaterials, type EnergyArtworkDrawing, type EnergyArtworkShape } from './energyArtworkGeometry';

/** A silent equipment illustration follows explicit simulated power, never inferred engine motion. */
export function createBackupGeneratorArtwork(prefix: string, on: boolean): EnergyArtworkDrawing {
  const material = energyArtworkMaterials(prefix);
  const shapes: EnergyArtworkShape[] = [
    ...ENERGY_ARTWORK_PLINTH,
    { kind: 'path', d: 'M43 121 L135 98 L204 117 L204 127 L111 151 L43 131 Z', fill: '#100D18', stroke: '#5B4B69', strokeWidth: .8 },
    { kind: 'path', d: 'M43 65 Q43 59 49 57 L138 33 Q143 32 149 34 L197 53 Q202 55 202 62 L202 117 Q202 122 197 124 L111 147 Q106 148 102 146 L48 128 Q43 127 43 121 Z', fill: material.metal, stroke: '#B8A6C9', strokeWidth: .8 },
    { kind: 'path', d: 'M49 62 L140 38 L197 59 L107 84 Z', fill: material.shell, stroke: '#A697B9', strokeWidth: .7 },
    { kind: 'path', d: 'M47 68 L104 88 L104 141 L47 122 Z', fill: material.shell, stroke: '#6B5D7E', strokeWidth: .6 },
    { kind: 'path', d: 'M110 88 L197 64 L197 117 Q197 120 193 122 L110 143 Z', fill: '#191624', stroke: '#62566F', strokeWidth: .7 },
    // Service hood and inset handle are drawn as machined surfaces, not a running motor.
    { kind: 'path', d: 'M66 60 L139 41 L180 57 L106 78 Z', fill: '#302A3D', stroke: '#71627F', strokeWidth: .6 },
    { kind: 'path', d: 'M99 54 L124 47 L139 53 L114 60 Z', fill: '#0D0B15', stroke: '#9382A4', strokeWidth: .8 },
    { kind: 'path', d: 'M103 54 L124 49 L135 53', fill: 'none', stroke: '#BBB0CA', strokeWidth: 1 },
    // The front instrument glass contains no invented numerical readings.
    { kind: 'path', d: 'M55 78 L94 91 L94 109 L55 96 Z', fill: material.glass, stroke: '#A393B7', strokeWidth: .6 },
    { kind: 'path', d: 'M62 85 L78 90 M62 89 L72 92', stroke: on ? '#DAC5FA' : '#645B75', strokeWidth: 1.5 },
    { kind: 'circle', cx: 86, cy: 97, r: 3, fill: on ? '#D8B8FF' : '#524A60', stroke: '#AA91C2', strokeWidth: .5 },
    { kind: 'path', d: 'M57 108 L91 119 M57 113 L91 124 M57 118 L91 129', stroke: '#6C5E7B', strokeWidth: 1.3 },
    { kind: 'path', d: 'M118 92 L188 73 L188 117 L118 135 Z', fill: '#0B0A12', stroke: '#695977', strokeWidth: .7 },
  ];
  // Eight embossed louvers are enough to read as cooling fins even in the compact controller.
  for (let index = 0; index < 8; index += 1) {
    const y = 96 + index * 4.5;
    shapes.push({ kind: 'path', d: `M124 ${y} L182 ${y - 16}`, stroke: index % 2 ? '#64566F' : '#887796', strokeWidth: 1.7 });
  }
  shapes.push(
    { kind: 'path', d: 'M48 63 L107 84 L198 60 M107 87 L107 142', fill: 'none', stroke: '#E0D3EF', strokeWidth: .7, opacity: .7 },
    { kind: 'path', d: 'M113 139 L192 118', stroke: material.violet, strokeWidth: 1, opacity: on ? .85 : .18 },
    { kind: 'circle', cx: 115, cy: 89, r: 1, fill: '#C7B9D7' },
    { kind: 'circle', cx: 192, cy: 68, r: 1, fill: '#C7B9D7' },
    { kind: 'circle', cx: 115, cy: 140, r: 1, fill: '#C7B9D7' },
    { kind: 'circle', cx: 193, cy: 120, r: 1, fill: '#C7B9D7' },
  );
  return { gradients: material.gradients, shapes };
}
