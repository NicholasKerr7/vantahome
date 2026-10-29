import type { EquipmentArtworkDrawing } from './equipmentArtworkGeometry';

/** A black-glass microwave with a dimensional metal chassis, recessed cavity and ceramic bowl. */
export function createMicrowaveEquipmentArtwork(prefix: string, on: boolean): EquipmentArtworkDrawing {
  return { viewBox: '0 0 320 210', gradients: [
    { id: `${prefix}-metal`, x2: '100%', y2: '15%', stops: [[0,'#736B83'],[.12,'#EBE7F3'],[.4,'#9D93AD'],[.7,'#DDD4E7'],[1,'#766186']] },
    { id: `${prefix}-body`, x2: '85%', y2: '100%', stops: [[0,'#514A60'],[.35,'#24202E'],[.7,'#111019'],[1,'#3B2B4C']] },
    { id: `${prefix}-glass`, x2: '85%', y2: '100%', stops: [[0,'#403747'],[.35,'#17131F'],[.75,'#0C0A12'],[1,'#32243E']] },
    { id: `${prefix}-cavity`, kind:'radial', cx:'75%', cy:'15%', r:'110%', stops: [[0,on?'#A07B59':'#302A3C'],[.48,on?'#473345':'#1C1727'],[1,'#0E0B16']] },
    { id: `${prefix}-ceramic`, x2:'100%', y2:'25%', stops:[[0,'#92869E'],[.25,'#F0E6E7'],[.6,'#C8BBCE'],[1,'#796882']] },
  ], shapes: [
    { kind:'ellipse',cx:162,cy:190,rx:139,ry:12,fill:'#08050E',opacity:.7 },
    { kind:'path',d:'M25 46 L48 24 H277 L296 42 V170 L278 186 H24 Z',fill:`url(#${prefix}-body)`,stroke:'#A394B5',strokeWidth:1.2 },
    { kind:'path',d:'M35 44 L52 30 H273 L284 42 Z',fill:`url(#${prefix}-metal)`,stroke:'#D0C3DE',strokeWidth:.7 },
    { kind:'path',d:'M282 48 L292 43 V166 L282 176 Z',fill:'#292031',stroke:'#75627E',strokeWidth:.8 },
    { kind:'path',d:'M286 65 V153 M289 62 V150',stroke:'#AA92B7',strokeWidth:.7,opacity:.4 },
    { kind:'rect',x:22,y:43,width:260,height:139,rx:13,fill:`url(#${prefix}-metal)`,stroke:'#DDD0ED',strokeWidth:1 },
    { kind:'rect',x:28,y:49,width:248,height:127,rx:10,fill:`url(#${prefix}-body)`,stroke:'#5D506C',strokeWidth:.8 },
    { kind:'rect',x:34,y:55,width:190,height:115,rx:8,fill:`url(#${prefix}-glass)`,stroke:'#796789',strokeWidth:1 },
    { kind:'rect',x:46,y:68,width:153,height:87,rx:5,fill:`url(#${prefix}-cavity)`,stroke:'#53455F',strokeWidth:.8 },
    { kind:'path',d:'M51 145 L64 133 H183 L194 145 Z',fill:'#302538',stroke:'#786187',strokeWidth:.8 },
    { kind:'path',d:'M51 73 H193 M51 78 H181',stroke:'#D7B9EC',strokeWidth:.6,opacity:.17 },
    // Interior geometry stays fixed; illumination indicates accepted preview power, not heat or progress.
    { kind:'ellipse',cx:124,cy:138,rx:47,ry:8,fill:'#5E4B68',stroke:'#A58BB5',strokeWidth:.9 },
    { kind:'ellipse',cx:124,cy:136,rx:42,ry:6,fill:'#95829F',opacity:.5 },
    { kind:'path',d:'M91 115 H157 L151 131 Q143 140 124 140 Q103 140 97 131 Z',fill:`url(#${prefix}-ceramic)`,stroke:'#D6C9DF',strokeWidth:.7 },
    { kind:'ellipse',cx:124,cy:115,rx:33,ry:7,fill:'#CBBED5',stroke:'#E2D4E9',strokeWidth:.8 },
    { kind:'ellipse',cx:124,cy:115,rx:27,ry:4,fill:'#796377' },
    { kind:'path',d:'M97 121 L100 129 M103 124 L105 132',stroke:'#FCF2F3',strokeWidth:.9,opacity:.5 },
    { kind:'path',d:'M51 72 L87 72 L51 108 Z M190 89 L190 146 H148 Z',fill:'#E7D8FF',opacity:.045 },
    { kind:'rect',x:208,y:71,width:6,height:84,rx:3,fill:`url(#${prefix}-metal)`,stroke:'#DCC8EB',strokeWidth:.6 },
    { kind:'rect',x:229,y:57,width:40,height:110,rx:7,fill:'#1A1523',stroke:'#594663',strokeWidth:.8 },
    { kind:'rect',x:234,y:65,width:30,height:26,rx:3,fill:'#0E0918',stroke:'#70577E',strokeWidth:.7 },
    { kind:'path',d:'M240 73 H258 M240 79 H252 M240 84 H255',stroke:on?'#D4B2FF':'#665174',strokeWidth:1.3 },
    { kind:'circle',cx:249,cy:115,r:13,fill:`url(#${prefix}-metal)`,stroke:'#E0C7F3',strokeWidth:.6 },
    { kind:'circle',cx:249,cy:115,r:10,fill:`url(#${prefix}-glass)` },
    { kind:'path',d:'M249 106 V109',stroke:'#D9C7EF',strokeWidth:1.3 },
    { kind:'rect',x:236,y:141,width:26,height:5,rx:2,fill:on?'#B46BFF':'#493956',testId:'microwave-preview-light' },
    { kind:'path',d:'M42 178 H265',stroke:'#C9ADE2',strokeWidth:.5,opacity:.6 },
    { kind:'rect',x:46,y:182,width:29,height:7,rx:2,fill:'#120C1D' },
    { kind:'rect',x:239,y:182,width:24,height:7,rx:2,fill:'#120C1D' },
  ] };
}
