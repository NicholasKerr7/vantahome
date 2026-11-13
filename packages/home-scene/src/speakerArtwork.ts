import type { EquipmentArtworkDrawing, EquipmentArtworkShape } from './equipmentArtworkGeometry';

/** Shared three-quarter projection keeps both console illustrations and their light layers aligned. */
export const SPEAKER_ARTWORK_VIEWBOX = '0 0 320 220';

/** Sparse perforations suggest an acoustic baffle without a texture image or SVG pattern. */
function createBafflePerforations(): EquipmentArtworkShape[] {
  return [104, 110, 182, 188].flatMap((x) => Array.from({ length: 18 }, (_, row) => ({
    kind: 'circle' as const, cx: x, cy: 63 + row * 6, r: 0.58,
    fill: '#AF9EAD', opacity: x === 110 || x === 182 ? 0.12 : 0.2,
  })));
}

/** A satin cabinet, curved walnut cheek and recessed drivers share one lightweight vector drawing. */
export function createSpeakerCabinetArtwork(prefix: string): EquipmentArtworkDrawing {
  const frame = `${prefix}-frame`;
  const front = `${prefix}-front`;
  const top = `${prefix}-top`;
  const walnut = `${prefix}-walnut`;
  const surround = `${prefix}-surround`;
  const diaphragm = `${prefix}-diaphragm`;
  const dome = `${prefix}-dome`;
  return {
    viewBox: SPEAKER_ARTWORK_VIEWBOX,
    gradients: [
      { id: frame, x2: '95%', y2: '100%', stops: [[0, '#B8ADB3'], [0.13, '#77737D'], [0.34, '#292B34'], [0.66, '#11131A'], [0.87, '#5C515F'], [1, '#A68B83']] },
      { id: front, x2: '75%', y2: '100%', stops: [[0, '#373740'], [0.35, '#1A1C25'], [0.8, '#0A0D15'], [1, '#24212C']] },
      { id: top, x2: '35%', y2: '100%', stops: [[0, '#8B828B'], [0.24, '#4F4B56'], [0.65, '#242731'], [1, '#161923']] },
      { id: walnut, x2: '100%', y2: '30%', stops: [[0, '#35241F'], [0.25, '#80543A'], [0.5, '#A87B53'], [0.71, '#62432F'], [1, '#281B1B']] },
      { id: surround, kind: 'radial', cx: '42%', cy: '37%', stops: [[0, '#0D111B'], [0.68, '#090C13'], [0.77, '#353741'], [0.87, '#171A23'], [0.95, '#77727B'], [1, '#22232D']] },
      { id: diaphragm, kind: 'radial', cx: '37%', cy: '29%', stops: [[0, '#86838E'], [0.24, '#60616E'], [0.45, '#383C4A'], [0.71, '#202530'], [0.89, '#4D4B57'], [1, '#111620']] },
      { id: dome, kind: 'radial', cx: '32%', cy: '22%', stops: [[0, '#B3A4B8'], [0.18, '#6B6277'], [0.45, '#353347'], [0.8, '#111525'], [1, '#080C15']] },
    ],
    shapes: [
      { kind: 'ellipse', cx: 164, cy: 204, rx: 87, ry: 9, fill: '#08060E', opacity: 0.48 },
      { kind: 'ellipse', cx: 161, cy: 203, rx: 57, ry: 4, fill: '#02040A', opacity: 0.6 },
      // The recessed plinth and walnut side meet behind one continuous metal front edge.
      { kind: 'path', d: 'M97 182 L205 193 L233 177 L230 192 L203 207 Q196 210 187 208 L104 196 Q96 194 97 182 Z', fill: '#0A0C14', stroke: '#3D3443', strokeWidth: 0.65 },
      { kind: 'path', d: 'M99 28 L213 14 Q225 13 237 25 Q246 31 245 43 L241 172 Q241 184 230 189 L204 202 L94 187 L86 49 Q85 34 99 28 Z', fill: `url(#${frame})`, stroke: '#615864', strokeWidth: 0.6 },
      { kind: 'path', d: 'M205 54 L240 36 L237 171 Q237 181 228 186 L204 199 Z', fill: `url(#${walnut})` },
      { kind: 'path', d: 'M216 51 C211 93 221 130 214 191 M223 46 C218 93 232 134 221 188 M230 43 C227 81 235 108 230 140 Q227 163 229 180', fill: 'none', stroke: '#D3A777', strokeWidth: 0.7, opacity: 0.4 },
      { kind: 'path', d: 'M218 49 C214 98 225 142 217 188 M226 45 C222 91 234 126 225 183 M235 40 Q231 90 235 124', fill: 'none', stroke: '#352018', strokeWidth: 1, opacity: 0.56 },
      { kind: 'path', d: 'M89 43 Q90 33 102 29 L213 17 Q223 15 233 26 L240 35 L205 54 Z', fill: `url(#${top})` },
      { kind: 'path', d: 'M100 30 L212 18 Q220 17 228 24', fill: 'none', stroke: '#D1BDBB', strokeWidth: 0.9, opacity: 0.68 },
      { kind: 'path', d: 'M117 35 L192 26 Q196 26 200 29 L211 35 L188 40 Z', fill: '#11151F', stroke: '#58505F', strokeWidth: 0.5 },
      { kind: 'path', d: 'M151 32 L157 33 M169 30 L175 31 M172 28 L172 33 M187 28 L191 30 L187 31', fill: 'none', stroke: '#C1ACBF', strokeWidth: 0.7, opacity: 0.68 },
      { kind: 'path', d: 'M99 38 L194 48 Q205 49 205 61 L202 183 Q202 199 188 199 L99 187 Q86 185 86 171 L87 52 Q87 37 99 38 Z', fill: `url(#${frame})` },
      { kind: 'path', d: 'M100 42 L192 52 Q200 53 200 63 L197 182 Q197 193 187 193 L100 181 Q92 180 92 169 L93 53 Q93 41 100 42 Z', fill: `url(#${front})` },
      { kind: 'path', d: 'M90 58 L89 167 Q88 181 100 184', fill: 'none', stroke: '#CFBDC7', strokeWidth: 0.8, opacity: 0.58 },
      { kind: 'path', d: 'M204 64 L201 182 Q201 196 190 197', fill: 'none', stroke: '#BE9C91', strokeWidth: 0.7, opacity: 0.42 },
      ...createBafflePerforations(),
      // Dark suspension surrounds and a small reflective dome provide depth without glow filters.
      { kind: 'ellipse', cx: 146, cy: 77, rx: 23, ry: 22, fill: '#080B12', stroke: '#776975', strokeWidth: 0.9 },
      { kind: 'ellipse', cx: 146, cy: 77, rx: 21, ry: 20, fill: `url(#${surround})` },
      { kind: 'ellipse', cx: 146, cy: 77, rx: 15, ry: 14, fill: '#101520', stroke: '#5B5868', strokeWidth: 0.7 },
      { kind: 'ellipse', cx: 146, cy: 77, rx: 10, ry: 9.5, fill: `url(#${dome})`, stroke: '#74667D', strokeWidth: 0.6 },
      { kind: 'path', d: 'M129 67 Q142 53 159 63', fill: 'none', stroke: '#C2AEBC', strokeWidth: 0.7, opacity: 0.5 },
      { kind: 'ellipse', cx: 146, cy: 135, rx: 41, ry: 39, fill: '#070A11', stroke: '#9B827A', strokeWidth: 1.1 },
      { kind: 'ellipse', cx: 146, cy: 135, rx: 38.5, ry: 36.5, fill: `url(#${surround})` },
      { kind: 'ellipse', cx: 146, cy: 135, rx: 31, ry: 29, fill: `url(#${diaphragm})`, stroke: '#77707E', strokeWidth: 0.55 },
      { kind: 'ellipse', cx: 146, cy: 135, rx: 24, ry: 22.5, fill: 'none', stroke: '#91909C', strokeWidth: 0.5, opacity: 0.25 },
      { kind: 'ellipse', cx: 146, cy: 135, rx: 17, ry: 16, fill: 'none', stroke: '#101724', strokeWidth: 1.2, opacity: 0.5 },
      { kind: 'ellipse', cx: 146, cy: 135, rx: 13, ry: 12.5, fill: `url(#${dome})`, stroke: '#8F7B97', strokeWidth: 0.6 },
      { kind: 'path', d: 'M112 120 Q122 98 147 99', fill: 'none', stroke: '#E0C7C5', strokeWidth: 0.8, opacity: 0.48 },
      { kind: 'path', d: 'M171 159 Q180 151 183 138', fill: 'none', stroke: '#81758A', strokeWidth: 0.7, opacity: 0.4 },
      { kind: 'path', d: 'M117 177 L174 183 Q178 183 178 186 Q178 188 173 187 L116 181 Q112 180 113 178 Z', fill: '#060910', stroke: '#4D414F', strokeWidth: 0.55 },
      { kind: 'path', d: 'M140 177 L145 181 L150 178', fill: 'none', stroke: '#B49AA6', strokeWidth: 0.9, opacity: 0.8 },
      { kind: 'path', d: 'M104 192 L188 203 Q197 204 205 201 L227 188', fill: 'none', stroke: '#51405F', strokeWidth: 1.4 },
    ],
  };
}

/** Decorative acoustic arcs and a plinth light indicate audible simulation, never a measured waveform. */
export function createSpeakerPlaybackArtwork(prefix: string): EquipmentArtworkDrawing {
  const light = `${prefix}-playback`;
  return {
    viewBox: SPEAKER_ARTWORK_VIEWBOX,
    gradients: [{ id: light, x2: '100%', y2: '0%', stops: [[0, '#6B3DA1'], [0.4, '#DCB7FF'], [0.7, '#AF77EC'], [1, '#6C4596']] }],
    shapes: [
      { kind: 'ellipse', cx: 157, cy: 205, rx: 63, ry: 5, fill: '#9E5CE3', opacity: 0.12 },
      { kind: 'path', d: 'M104 192 L188 203 Q197 204 205 201 L227 188', fill: 'none', stroke: `url(#${light})`, strokeWidth: 2 },
      { kind: 'path', d: 'M76 103 Q65 128 75 151 M65 94 Q49 128 63 160', fill: 'none', stroke: '#B18ADE', strokeWidth: 1.1, opacity: 0.36 },
      { kind: 'path', d: 'M254 88 Q264 113 254 137 M265 80 Q281 113 267 146', fill: 'none', stroke: '#B18ADE', strokeWidth: 1.1, opacity: 0.3 },
      { kind: 'path', d: 'M114 153 Q128 173 153 171', fill: 'none', stroke: '#BA93E1', strokeWidth: 1.2, opacity: 0.5 },
    ],
  };
}
