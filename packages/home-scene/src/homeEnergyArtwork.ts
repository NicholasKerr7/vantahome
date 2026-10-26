import { sculptedEnergyMaterials, type EnergyArtworkDrawing, type EnergyArtworkShape } from './energyArtworkGeometry';

/** A large recessed home instrument distinguishes grid samples without inventing a consumption gauge or power flow. */
export function createHomeEnergyArtwork(prefix: string, available: boolean | null): EnergyArtworkDrawing {
  const m = sculptedEnergyMaterials(prefix);
  const indicator = available === true ? '#DAB4FF' : available === false ? '#D5AD78' : '#74657F';
  const shapes: EnergyArtworkShape[] = [
    { kind: 'ellipse', cx: 132, cy: 189, rx: 103, ry: 9, fill: '#080510', opacity: .65 },
    // A wide graphite distribution panel carries one dominant machined instrument.
    { kind: 'rect', x: 31, y: 22, width: 205, height: 163, rx: 25, fill: '#1E152A' },
    { kind: 'rect', x: 25, y: 15, width: 208, height: 165, rx: 26, fill: m.edge },
    { kind: 'rect', x: 29, y: 19, width: 200, height: 157, rx: 23, fill: m.graphite },
    { kind: 'path', d: 'M53 23 H204 Q225 23 225 46 V147 Q224 170 203 171 H54 Q34 170 33 149 V46 Q34 25 53 23 Z', fill: 'none', stroke: '#BD9FD1', strokeWidth: .6, opacity: .4 },
    { kind: 'circle', cx: 129, cy: 90, r: 66, fill: '#0E0916', stroke: '#776087', strokeWidth: 1 },
    { kind: 'circle', cx: 129, cy: 88, r: 64, fill: m.edge },
    { kind: 'circle', cx: 129, cy: 88, r: 57, fill: '#140C1F', stroke: '#39223F', strokeWidth: 2 },
    { kind: 'circle', cx: 129, cy: 88, r: 51, fill: m.well, stroke: '#8B659D', strokeWidth: .8 },
    { kind: 'circle', cx: 129, cy: 88, r: 54, fill: 'none', stroke: indicator, strokeWidth: 1.8 },
    // A grounded home symbol remains readable when the grid sample is unavailable.
    { kind: 'path', d: 'M106 83 L129 63 L152 83 L148 87 L129 71 L110 87 Z', fill: m.ceramic },
    { kind: 'path', d: 'M113 85 V105 Q113 108 116 108 H125 V94 H134 V108 H143 Q146 108 146 105 V85 L129 71 Z', fill: m.ceramic },
    { kind: 'path', d: 'M120 86 L129 78 L137 85', fill: 'none', stroke: '#FAF1FF', strokeWidth: .6, opacity: .6 },
    { kind: 'circle', cx: 129, cy: 122, r: 2.4, fill: indicator },
    // Two restrained glass reflections keep the instrument tactile without blur or a glow layer.
    { kind: 'path', d: 'M87 76 Q95 42 130 39 Q107 61 96 90 Z', fill: '#F5DEFF', opacity: .13 },
    { kind: 'path', d: 'M101 130 Q134 151 165 120', fill: 'none', stroke: '#DFB9F1', strokeWidth: 1.1, opacity: .3 },
  ];
  // Bezel etching is fixed decoration; it never represents measured usage or reserve.
  for (let index = 0; index < 24; index += 1) {
    const angle = index * Math.PI / 12;
    const x1 = 129 + Math.sin(angle) * 60;
    const y1 = 88 - Math.cos(angle) * 60;
    const x2 = 129 + Math.sin(angle) * 62;
    const y2 = 88 - Math.cos(angle) * 62;
    shapes.push({ kind: 'path', d: `M${x1.toFixed(2)} ${y1.toFixed(2)} L${x2.toFixed(2)} ${y2.toFixed(2)}`, stroke: '#F0DDFB', strokeWidth: .7, opacity: .6 });
  }
  // Four connector wells add physical scale, without depicting other devices or transmission direction.
  for (const x of [79, 107, 135, 163]) {
    shapes.push({ kind: 'rect', x, y: 158, width: 16, height: 11, rx: 3, fill: '#0C0713', stroke: '#71567F', strokeWidth: .7 },
      { kind: 'path', d: `M${x + 4} 161 V166 M${x + 8} 161 V166 M${x + 12} 161 V166`, stroke: '#A28DAE', strokeWidth: .8 });
  }
  shapes.push(
    { kind: 'path', d: 'M45 40 V147 M214 40 V147', stroke: '#100A18', strokeWidth: 2, opacity: .7 },
    { kind: 'circle', cx: 46, cy: 34, r: 2.2, fill: '#B197C1' },
    { kind: 'circle', cx: 213, cy: 34, r: 2.2, fill: '#B197C1' },
    { kind: 'path', d: 'M48 18 H204 Q221 19 228 36', fill: 'none', stroke: '#EFDEFB', strokeWidth: .8, opacity: .65 },
  );
  return { viewBox: '0 0 260 200', gradients: m.gradients, shapes };
}
