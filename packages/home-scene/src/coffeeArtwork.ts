import type { EquipmentArtworkDrawing } from './equipmentArtworkGeometry';

/** A substantial espresso machine: smoked hopper, satin metal chassis, bronze trim and ceramic cup. */
export function createCoffeeEquipmentArtwork(prefix: string, on: boolean): EquipmentArtworkDrawing {
  return { viewBox: '0 0 280 240', gradients: [
    { id: `${prefix}-metal`, x2: '100%', y2: '15%', stops: [[0,'#716777'],[.12,'#F1EBF3'],[.35,'#ACA1B4'],[.6,'#D5CBDC'],[1,'#716079']] },
    { id: `${prefix}-body`, x2: '100%', y2: '80%', stops: [[0,'#797080'],[.15,'#3C3544'],[.65,'#211C29'],[1,'#504257']] },
    { id: `${prefix}-bronze`, x2: '100%', y2: '30%', stops: [[0,'#997059'],[.25,'#E9C9A8'],[.6,'#937056'],[.85,'#D9B893'],[1,'#684835']] },
    { id: `${prefix}-glass`, kind: 'radial', cx: '25%', cy: '15%', r: '95%', stops: [[0,'#776580'],[.4,'#2D2539'],[1,'#0E0A17']] },
    { id: `${prefix}-cup`, x2: '100%', y2: '30%', stops: [[0,'#B7A9C2'],[.25,'#FFF4EA'],[.6,'#F2E2D9'],[1,'#AA93AA']] },
    { id: `${prefix}-crema`, kind: 'radial', stops: [[0,'#C99A68'],[.7,'#9B673C'],[1,'#523323']] },
  ], shapes: [
    { kind:'ellipse',cx:140,cy:225,rx:104,ry:11,fill:'#08050D',opacity:.65 },
    // A smoky hopper and subtly visible beans give scale without representing the saved reservoir sample.
    { kind:'path',d:'M77 21 H131 L127 47 H81 Z',fill:`url(#${prefix}-glass)`,stroke:'#9C8BAA',strokeWidth:1 },
    { kind:'path',d:'M83 34 Q90 27 98 33 Q105 26 112 33 Q121 28 126 35 V43 H83 Z',fill:'#6B4436',opacity:.65 },
    { kind:'path',d:'M90 33 L94 39 M105 32 L109 40 M119 33 L120 39',stroke:'#D0A07A',strokeWidth:.8,opacity:.5 },
    { kind:'rect',x:73,y:16,width:62,height:7,rx:3,fill:`url(#${prefix}-metal)`,stroke:'#B6A6C4',strokeWidth:.7 },
    { kind:'path',d:'M48 59 Q48 46 61 45 H211 L232 61 V205 Q231 216 218 219 H48 Z',fill:`url(#${prefix}-body)`,stroke:'#B5A5C6',strokeWidth:1.2 },
    { kind:'path',d:'M213 51 L230 63 V203 L214 213 Z',fill:'#29222F',stroke:'#67546E',strokeWidth:.8 },
    { kind:'path',d:'M219 70 V191 M223 73 V187',stroke:'#87738E',strokeWidth:1,opacity:.45 },
    { kind:'rect',x:44,y:51,width:169,height:164,rx:12,fill:`url(#${prefix}-metal)`,stroke:'#DED2E7',strokeWidth:.8 },
    { kind:'rect',x:50,y:57,width:157,height:153,rx:9,fill:`url(#${prefix}-body)`,stroke:'#55485F',strokeWidth:.7 },
    { kind:'path',d:'M55 63 Q55 60 61 60 H194',fill:'none',stroke:'#EFE4F7',strokeWidth:.7,opacity:.7 },
    { kind:'rect',x:60,y:69,width:119,height:42,rx:8,fill:`url(#${prefix}-glass)`,stroke:'#927A9F',strokeWidth:1 },
    { kind:'rect',x:72,y:79,width:50,height:21,rx:4,fill:'#161020',stroke:'#5C426E',strokeWidth:.7 },
    { kind:'path',d:'M80 90 H113 M85 85 H108',stroke:on?'#D7B1FF':'#66516F',strokeWidth:1.5 },
    { kind:'circle',cx:144,cy:89,r:11,fill:`url(#${prefix}-bronze)`,stroke:'#E2C0A4',strokeWidth:.6 },
    { kind:'circle',cx:144,cy:89,r:8,fill:`url(#${prefix}-glass)` },
    { kind:'path',d:'M144 81 V85',stroke:'#E5D3ED',strokeWidth:1.3 },
    { kind:'circle',cx:165,cy:89,r:3,fill:on?'#D6ABFF':'#65536F' },
    // Recessed brew bay, group head, portafilter and a separate steam wand.
    { kind:'rect',x:63,y:118,width:121,height:79,rx:5,fill:'#100C17',stroke:'#766180',strokeWidth:.8 },
    { kind:'rect',x:68,y:122,width:111,height:70,rx:3,fill:`url(#${prefix}-glass)` },
    { kind:'path',d:'M97 115 H143 L139 131 H101 Z',fill:`url(#${prefix}-metal)`,stroke:'#D7C7E4',strokeWidth:.7 },
    { kind:'rect',x:103,y:127,width:34,height:9,rx:3,fill:`url(#${prefix}-bronze)`,stroke:'#D2AF92',strokeWidth:.6 },
    { kind:'path',d:'M114 136 V142 H126 V136',fill:'#8E7C99',stroke:'#CABBDA',strokeWidth:1 },
    { kind:'rect',x:136,y:129,width:34,height:6,rx:3,fill:'#241B2F',stroke:'#7C638C',strokeWidth:.8 },
    { kind:'path',d:'M188 116 V137 Q188 145 180 149 L177 171',fill:'none',stroke:'#D4C4DF',strokeWidth:4 },
    { kind:'path',d:'M188 117 V136 Q188 144 180 148',fill:'none',stroke:'#7C668C',strokeWidth:1.4 },
    { kind:'rect',x:173,y:168,width:6,height:12,rx:2,fill:'#A995B4' },
    { kind:'path',d:'M55 194 H201 L207 205 H50 Z',fill:`url(#${prefix}-metal)`,stroke:'#D9C7E8',strokeWidth:.8 },
    { kind:'path',d:'M62 198 H192 M65 201 H195',stroke:'#46364E',strokeWidth:1.2 },
    { kind:'ellipse',cx:120,cy:193,rx:36,ry:6,fill:'#5F4B69',stroke:'#C3ABC8',strokeWidth:.7 },
    { kind:'ellipse',cx:120,cy:191,rx:32,ry:4,fill:'#CBB7CD' },
    { kind:'path',d:'M141 161 Q159 158 156 173 Q153 183 141 180',fill:'none',stroke:'#BBA4BA',strokeWidth:6 },
    { kind:'path',d:'M142 162 Q156 159 153 172 Q150 178 143 178',fill:'none',stroke:'#FAE8DD',strokeWidth:3 },
    { kind:'path',d:'M96 157 H144 L141 181 Q137 190 120 190 Q103 190 99 181 Z',fill:`url(#${prefix}-cup)`,stroke:'#DBC6DB',strokeWidth:.6 },
    { kind:'ellipse',cx:120,cy:157,rx:24,ry:5,fill:'#F4E5E1',stroke:'#D2BBCD',strokeWidth:.6 },
    { kind:'ellipse',cx:120,cy:157,rx:20,ry:3,fill:on?`url(#${prefix}-crema)`:'#665064' },
    { kind:'path',d:'M104 164 L106 180',stroke:'#FFFFFF',strokeWidth:1,opacity:.45 },
    { kind:'rect',x:61,y:213,width:17,height:7,rx:2,fill:'#100C17' },
    { kind:'rect',x:186,y:213,width:17,height:7,rx:2,fill:'#100C17' },
    { kind:'path',d:'M87 208 H170',stroke:`url(#${prefix}-bronze)`,strokeWidth:2 },
  ] };
}

/** Decorative steam and a short pour identify preview activity without a timer or filling-cup progress. */
export function createCoffeeSteamArtwork(): EquipmentArtworkDrawing {
  return { viewBox:'0 0 280 240', gradients:[], shapes:[
    { kind:'path',d:'M116 142 V153 M124 142 V153',stroke:'#B58258',strokeWidth:1.3,opacity:.85 },
    { kind:'path',d:'M104 153 C97 147 110 143 105 136 M134 153 C141 145 132 143 137 136',fill:'none',stroke:'#DED0EB',strokeWidth:1.2,opacity:.65 },
  ] };
}
