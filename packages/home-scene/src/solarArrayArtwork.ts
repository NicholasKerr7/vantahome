import { ENERGY_ARTWORK_PLINTH, energyArtworkMaterials, type EnergyArtworkDrawing, type EnergyArtworkShape } from './energyArtworkGeometry';

/** Two glass modules share a machined rack; reflections are decorative, never live sunlight. */
export function createSolarArrayArtwork(prefix: string): EnergyArtworkDrawing {
  const material = energyArtworkMaterials(prefix);
  const shapes: EnergyArtworkShape[] = [
    ...ENERGY_ARTWORK_PLINTH,
    // Braced legs and feet sit behind the panel plane.
    { kind: 'path', d: 'M58 86 L58 128 L66 131 L66 86 M158 60 L158 116 L165 118 L165 61', fill: material.metal, stroke: '#998AA9', strokeWidth: .6 },
    { kind: 'path', d: 'M61 92 L105 136 M161 73 L199 115', fill: 'none', stroke: '#796A8A', strokeWidth: 2 },
    { kind: 'path', d: 'M48 128 L60 125 L76 130 L64 134 Z M151 118 L163 114 L176 118 L165 122 Z', fill: material.metal },
    // Extruded outer frame gives the cells depth without blur, masks or another renderer.
    { kind: 'path', d: 'M27 57 L163 18 L215 98 L215 105 L78 145 L27 65 Z', fill: material.shell, stroke: '#8E7C9F', strokeWidth: .8 },
    { kind: 'path', d: 'M27 57 L163 18 L215 98 L78 138 Z', fill: material.metal, stroke: '#DCD0EB', strokeWidth: .8 },
    { kind: 'path', d: 'M32 59 L162 22 L209 96 L80 133 Z', fill: '#0A0C1B', stroke: '#635B7A', strokeWidth: 1 },
    { kind: 'path', d: 'M36 60 L96 43 L141 115 L82 132 Z M101 42 L160 25 L206 96 L146 113 Z', fill: material.glass, stroke: '#9184AF', strokeWidth: .5 },
  ];
  // A single path per module keeps cell detail legible and the SVG node count bounded.
  shapes.push(
    { kind: 'path', d: 'M56 54 L101 126 M76 48 L121 121 M47 78 L107 61 M58 96 L118 79 M70 114 L130 97 M121 36 L166 107 M140 31 L186 102 M112 60 L171 43 M123 78 L183 60 M135 96 L195 78', fill: 'none', stroke: '#A18EC5', strokeWidth: .65, opacity: .7 },
    { kind: 'path', d: 'M39 61 L93 46 L103 61 L49 77 Z M104 43 L157 28 L166 42 L114 57 Z', fill: '#E5DCFF', opacity: .1 },
    { kind: 'path', d: 'M67 52 L73 50 L118 122 L112 124 Z M155 27 L159 26 L205 96 L201 98 Z', fill: '#C6BCF2', opacity: .13 },
    { kind: 'path', d: 'M99 42 L145 115 M29 58 L79 138 L213 99', fill: 'none', stroke: '#D7C5EB', strokeWidth: 1.1 },
    { kind: 'path', d: 'M80 141 L212 102', fill: 'none', stroke: material.violet, strokeWidth: 1.2, opacity: .65 },
    { kind: 'path', d: 'M29 62 L78 141 M32 56 L161 19', fill: 'none', stroke: '#FFFFFF', strokeWidth: .6, opacity: .5 },
  );
  return { gradients: material.gradients, shapes };
}
