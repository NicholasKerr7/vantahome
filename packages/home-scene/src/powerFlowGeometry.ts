import type { EnergySourceId } from './energyFlowInsights';

/** Shared, static vector geometry keeps the native and embedded power maps identical. */
export interface EnergyArtworkPath {
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
}

export const ENERGY_FLOW_VIEWBOX = '0 0 360 180';

/** Each route starts at its source; the battery can reverse toward storage. */
export const ENERGY_FLOW_ROUTES: Record<EnergySourceId, { d: string; arrowIn: string; arrowOut: string }> = {
  solar: { d: 'M65 55 H89 Q105 55 117 67 L147 85', arrowIn: 'M116 62 L123 71 L112 70', arrowOut: 'M116 62 L108 62 L112 70' },
  battery: { d: 'M65 140 H95 Q105 140 118 129 L151 109', arrowIn: 'M117 122 L128 123 L124 133', arrowOut: 'M124 117 L117 127 L129 126' },
  grid: { d: 'M295 55 H272 Q257 55 245 67 L215 85', arrowIn: 'M244 62 L237 71 L248 70', arrowOut: 'M244 62 L252 62 L248 70' },
  generator: { d: 'M295 140 H266 Q253 140 241 129 L210 110', arrowIn: 'M243 122 L232 123 L236 133', arrowOut: 'M236 117 L243 127 L231 126' },
};

export const ENERGY_FLOW_ARTWORK: readonly EnergyArtworkPath[] = [
  // A restrained survey grid and floating plinth establish depth without a renderer.
  { d: 'M40 88 L180 12 L320 88 L180 168 Z M75 107 L215 31 M110 126 L250 50 M145 145 L285 69 M75 69 L215 145 M110 50 L250 126 M145 31 L285 107', fill: 'none', stroke: '#B995D8', strokeWidth: .6, opacity: .12 },
  { d: 'M109 105 L182 68 L250 105 L182 146 Z', fill: '#090712', opacity: .65 },
  { d: 'M111 96 L182 61 L249 96 L249 106 L182 143 L111 106 Z', fill: '#1D152B', stroke: '#5A426E', strokeWidth: .8 },
  { d: 'M111 96 L182 61 L249 96 L182 133 Z', fill: '#30233F', stroke: '#9C74BA', strokeWidth: .8 },
  { d: 'M182 133 V143 M118 101 L182 136 L242 103', fill: 'none', stroke: '#B78FE1', strokeWidth: .6, opacity: .7 },
  // Architecture: offset roof planes, glazed entrance, stone sides and a warm interior.
  { d: 'M142 71 L182 51 L220 72 V104 L181 125 L142 104 Z', fill: '#AD9AB9', stroke: '#DFD0EB', strokeWidth: .6 },
  { d: 'M181 89 L220 72 V104 L181 125 Z', fill: '#695A7D' },
  { d: 'M140 71 L177 38 L225 64 L184 88 Z', fill: '#292036', stroke: '#CFB3E6', strokeWidth: .8 },
  { d: 'M140 71 L177 38 L177 65 L184 88 Z', fill: '#4D3A61' },
  { d: 'M177 38 L225 64 L225 70 L184 94 L140 76 V71 L184 88 L225 64', fill: '#1B1328', stroke: '#AC88C6', strokeWidth: .6 },
  { d: 'M150 81 L160 87 V99 L150 94 Z M164 89 L174 94 V106 L164 101 Z', fill: '#F0CC9F', stroke: '#4C3D5B', strokeWidth: 1.5 },
  { d: 'M188 96 L214 82 V103 L188 117 Z', fill: '#DBC1EA', stroke: '#352842', strokeWidth: 2 },
  { d: 'M200 89 V110 M188 106 L214 92', fill: 'none', stroke: '#655178', strokeWidth: 1.5 },
  { d: 'M185 117 L216 101 L226 107 L195 125 Z', fill: '#B8A2C9', stroke: '#E1CFEF', strokeWidth: .5 },
  { d: 'M195 125 L226 107 V111 L195 129 Z', fill: '#675678' },
  // Solar array: glass cells and a raised, angled metal stand.
  { d: 'M30 61 L60 73 L84 59 L55 47 Z', fill: '#110D1D', stroke: '#4B355E', strokeWidth: .6 },
  { d: 'M45 49 V63 M68 46 V61', fill: 'none', stroke: '#967CA9', strokeWidth: 2 },
  { d: 'M27 44 L62 31 L84 47 L49 61 Z', fill: '#574368', stroke: '#CCB6E0', strokeWidth: 1 },
  { d: 'M29 42 L62 29 L84 45 L49 59 Z', fill: '#28213F', stroke: '#B293D3', strokeWidth: 1 },
  { d: 'M40 38 L61 54 M51 34 L72 50 M36 48 L69 35 M43 53 L77 41', fill: 'none', stroke: '#9C83B8', strokeWidth: .65 },
  { d: 'M31 42 L62 31 L69 36 L39 48 Z', fill: '#B895E2', opacity: .18 },
  // Battery: slender enclosure with a softly lit charge indicator.
  { d: 'M34 148 L58 159 L79 147 L55 136 Z', fill: '#100B1A', stroke: '#4B355E', strokeWidth: .6 },
  { d: 'M41 112 L58 105 L73 114 V146 L57 154 L41 146 Z', fill: '#D2C5DD', stroke: '#EBDFF4', strokeWidth: .7 },
  { d: 'M57 122 L73 114 V146 L57 154 Z', fill: '#766385' },
  { d: 'M41 112 L58 105 L73 114 L57 122 Z', fill: '#B6A4C7' },
  { d: 'M46 119 L52 122 V126 L46 123 Z', fill: '#B48BE3' },
  { d: 'M46 132 L52 135 M46 136 L52 139 M46 140 L52 143', fill: 'none', stroke: '#766484', strokeWidth: .8 },
  // JPS connection: pole and distribution conductors, deliberately distinct from generation.
  { d: 'M279 64 L302 76 L323 64 L300 53 Z', fill: '#100B1A', stroke: '#4B355E', strokeWidth: .6 },
  { d: 'M300 69 V20 M285 32 H316 M289 23 V35 M312 23 V35 M285 43 H316 M289 38 V47 M312 38 V47', fill: 'none', stroke: '#BAA7CC', strokeWidth: 2, opacity: .9 },
  { d: 'M298 65 H302 M289 27 H293 M308 27 H312', fill: 'none', stroke: '#E4C6FF', strokeWidth: 2 },
  // Generator: graphite cabinet, vent grille, top panel and copper service seam.
  { d: 'M273 147 L300 162 L331 146 L304 130 Z', fill: '#100B1A', stroke: '#4B355E', strokeWidth: .6 },
  { d: 'M276 121 L307 108 L326 119 V142 L295 156 L276 145 Z', fill: '#40334E', stroke: '#AF96C2', strokeWidth: .8 },
  { d: 'M276 121 L307 108 L326 119 L295 133 Z', fill: '#867395' },
  { d: 'M295 133 L326 119 V142 L295 156 Z', fill: '#201A2C' },
  { d: 'M283 122 L307 112 L318 119 L295 129 Z', fill: '#50415F' },
  { d: 'M302 134 L319 127 M302 138 L319 131 M302 142 L319 135 M302 146 L319 139', fill: 'none', stroke: '#8F769F', strokeWidth: 1.2 },
  { d: 'M281 129 L288 133 V137 L281 133 Z', fill: '#C2A0DF' },
];
