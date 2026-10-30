import type { EquipmentArtworkDrawing, EquipmentArtworkShape } from './equipmentArtworkGeometry';
import type { GasMeterSnapshot } from './gasMeterController';

/** Sculpt a metal metering station with copper unions, a valve lever and a recessed sample-supply gauge. */
export function createGasMeterArtwork(prefix: string, meter: GasMeterSnapshot): EquipmentArtworkDrawing {
  const status = meter.interlocked ? '#F3B675' : meter.valveOpen === null ? '#80758C' : meter.valveOpen ? '#C298F4' : '#A49AB4';
  const segments: EquipmentArtworkShape[] = Array.from({ length: 10 }, (_, index) => ({ kind: 'rect', x: 109 + index * 10, y: 116, width: 6, height: 18, rx: 2,
    fill: meter.remainingPercent !== null && index < Math.ceil(meter.remainingPercent / 10) ? status : '#302A3D' }));
  return { viewBox: '0 0 320 210', gradients: [
    { id: `${prefix}-metal`, x2: '100%', y2: '30%', stops: [[0,'#574E64'],[.18,'#DAD2E3'],[.38,'#8E819D'],[.62,'#E6DDEB'],[1,'#695575']] },
    { id: `${prefix}-body`, x2: '80%', y2: '100%', stops: [[0,'#AAA0B8'],[.12,'#E8E1EF'],[.4,'#B7ABC5'],[.72,'#7F6C92'],[1,'#BEB0CE']] },
    { id: `${prefix}-glass`, x2: '75%', y2: '100%', stops: [[0,'#48384F'],[.42,'#16101E'],[1,'#30213F']] },
    { id: `${prefix}-copper`, x2: '100%', y2: '0%', stops: [[0,'#624438'],[.25,'#C8A082'],[.45,'#EAC5A4'],[.7,'#AA7D64'],[1,'#593E36']] },
    { id: `${prefix}-valve`, x2: '100%', y2: '100%', stops: [[0,'#DEC7FA'],[.25,'#A77FCB'],[.65,'#69428D'],[1,'#341E4F']] },
  ], shapes: [
    { kind:'ellipse',cx:160,cy:195,rx:123,ry:9,fill:'#090510',opacity:.65 },
    // Wide metal lines represent fixed plumbing; they never imply animated physical flow.
    { kind:'path',d:'M42 186 V62 Q42 45 60 45 H103 V66 M218 66 V45 H260 Q278 45 278 64 V185',fill:'none',stroke:`url(#${prefix}-metal)`,strokeWidth:14 },
    { kind:'path',d:'M39 183 V63 Q39 42 59 42 H101 M221 42 H259 Q275 42 275 64 V183',fill:'none',stroke:'#E8DDED',strokeWidth:1.2,opacity:.65 },
    ...[37,272].flatMap((x): EquipmentArtworkShape[] => [
      {kind:'rect',x:x-4,y:154,width:19,height:18,rx:2,fill:`url(#${prefix}-copper)`,stroke:'#D9AF95',strokeWidth:.7},
      {kind:'path',d:`M${x-3} 158 h17 M${x-3} 168 h17`,fill:'none',stroke:'#624439',strokeWidth:1},
    ]),
    ...[94,209].map((x): EquipmentArtworkShape => ({kind:'rect',x,y:52,width:24,height:22,rx:3,fill:`url(#${prefix}-copper)`,stroke:'#DFC2AA',strokeWidth:1})),
    {kind:'path',d:'M83 72 L95 61 H227 L240 74 V175 L228 188 H83 Z',fill:`url(#${prefix}-metal)`,stroke:'#DDD1E9',strokeWidth:1},
    {kind:'rect',x:77,y:68,width:157,height:116,rx:24,fill:`url(#${prefix}-body)`,stroke:'#EEE5F5',strokeWidth:1.2},
    {kind:'rect',x:85,y:76,width:141,height:100,rx:19,fill:`url(#${prefix}-glass)`,stroke:'#776183',strokeWidth:1},
    {kind:'rect',x:98,y:94,width:115,height:52,rx:9,fill:'#100C1B',stroke:'#78608D',strokeWidth:1},
    {kind:'path',d:'M108 104 H155 M108 108 H133 M182 104 H203',fill:'none',stroke:'#C7B6DA',strokeWidth:1,opacity:.8},
    ...segments,
    {kind:'path',d:'M104 139 H207',fill:'none',stroke:'#51415F',strokeWidth:.7},
    {kind:'path',d:'M101 83 H174 L89 157 V96 Q89 83 101 83',fill:'#E7D8FB',opacity:.06},
    {kind:'rect',x:139,y:157,width:34,height:3,rx:1.5,fill:status,testId:'gas-meter-status-light'},
    {kind:'circle',cx:117,cy:160,r:2,fill:'#6A5577'},
    {kind:'circle',cx:195,cy:160,r:2,fill:'#6A5577'},
    {kind:'path',d:'M95 179 H215',fill:'none',stroke:'#F6EDFC',strokeWidth:.8,opacity:.7},
    {kind:'circle',cx:278,cy:95,r:17,fill:`url(#${prefix}-copper)`,stroke:'#D6B699',strokeWidth:1},
    {kind:'circle',cx:278,cy:95,r:11,fill:'#3B2A39',stroke:'#A080A4',strokeWidth:1},
    {kind:'rect',x:meter.valveOpen ? 274 : 253,y:meter.valveOpen ? 70 : 91,width:meter.valveOpen ? 8 : 50,height:meter.valveOpen ? 50 : 8,rx:4,fill:`url(#${prefix}-valve)`,stroke:'#C2A0DE',strokeWidth:.7,opacity:meter.valveOpen === null ? 0 : 1,testId:'gas-meter-valve-lever'},
    {kind:'circle',cx:278,cy:95,r:4,fill:'#D7BEDD',stroke:'#594163',strokeWidth:1},
    {kind:'path',d:'M40 178 H47 M275 178 H282',fill:'none',stroke:'#DBC8EB',strokeWidth:1},
  ] };
}
