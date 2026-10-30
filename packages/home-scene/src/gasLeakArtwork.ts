import type { EquipmentArtworkDrawing, EquipmentArtworkShape } from './equipmentArtworkGeometry';
import { gasLeakTone, type GasLeakSnapshot } from './gasLeakController';

/** Render a pearl-metal detector with recessed sensing vents and a steady accepted-state signal ring. */
export function createGasLeakArtwork(prefix: string, detector: GasLeakSnapshot): EquipmentArtworkDrawing {
  const tone = gasLeakTone(detector);
  const signal = tone === 'alarm' ? '#FFB478' : tone === 'unknown' ? '#B9A8C2' : '#B78ADF';
  const vents: EquipmentArtworkShape[] = Array.from({ length: 7 }, (_, index) => ({ kind: 'rect', x: 124 + index * 10, y: 143, width: 5, height: 15 - Math.abs(3 - index), rx: 2.5, fill: '#261E31', stroke: '#AA99B9', strokeWidth: .6 }));
  return { viewBox: '0 0 320 210', gradients: [
    { id: `${prefix}-edge`, x2:'100%', y2:'55%', stops:[[0,'#5D506D'],[.15,'#E2D5ED'],[.4,'#A694B7'],[.65,'#F1E5F7'],[1,'#78618F']] },
    { id: `${prefix}-pearl`, x2:'80%', y2:'100%', stops:[[0,'#EEE8F4'],[.3,'#C9BED7'],[.7,'#A99BBE'],[1,'#C6B5D9']] },
    { id: `${prefix}-core`, kind:'radial', cx:'35%', cy:'23%', r:'90%', stops:[[0,'#54425F'],[.45,'#201627'],[1,'#100C18']] },
    { id: `${prefix}-ring`, x2:'75%', y2:'100%', stops:[[0,'#F5E3FF'],[.35,signal],[.72,'#5D3B76'],[1,signal]] },
  ], shapes: [
    { kind:'ellipse',cx:161,cy:194,rx:84,ry:10,fill:'#08040F',opacity:.7 },
    { kind:'rect',x:87,y:17,width:152,height:174,rx:48,fill:`url(#${prefix}-edge)`,stroke:'#CCB4E4',strokeWidth:1 },
    { kind:'rect',x:81,y:12,width:151,height:174,rx:48,fill:`url(#${prefix}-pearl)`,stroke:'#EEE1F7',strokeWidth:1 },
    { kind:'path',d:'M96 46 Q101 20 131 20 H186 Q209 20 221 44',fill:'none',stroke:'#FFFFFF',strokeWidth:1.5,opacity:.6 },
    { kind:'path',d:'M226 55 V144 Q226 175 198 180',fill:'none',stroke:'#76618C',strokeWidth:1.3,opacity:.7 },
    { kind:'circle',cx:156,cy:85,r:49,fill:'#746283',stroke:'#D8C7EA',strokeWidth:1 },
    { kind:'circle',cx:156,cy:85,r:45,fill:`url(#${prefix}-ring)` },
    { kind:'circle',cx:156,cy:85,r:41,fill:`url(#${prefix}-core)`,stroke:'#2C1D3C',strokeWidth:1 },
    { kind:'circle',cx:156,cy:85,r:31,fill:'#201729',stroke:'#78608B',strokeWidth:.7 },
    { kind:'path',d:'M156 62 L176 73 V96 L156 108 L136 96 V73 Z',fill:'#352341',stroke:'#B79ACB',strokeWidth:.8 },
    { kind:'path',d:'M156 69 L170 77 V92 L156 101 L142 92 V77 Z',fill:'#120D1B',stroke:'#665071',strokeWidth:.7 },
    { kind:'circle',cx:156,cy:85,r:8,fill:'#493455',stroke:signal,strokeWidth:1.2 },
    { kind:'circle',cx:156,cy:85,r:3,fill:signal },
    { kind:'path',d:'M126 57 Q140 43 159 45 M122 64 L124 61',fill:'none',stroke:'#F3D8FF',strokeWidth:1,opacity:.5 },
    ...vents,
    { kind:'rect',x:142,y:166,width:28,height:5,rx:2.5,fill:signal,testId:'gas-leak-status-light' },
    { kind:'circle',cx:99,cy:122,r:2,fill:'#7A668A' },
    { kind:'circle',cx:213,cy:122,r:2,fill:'#7A668A' },
    { kind:'path',d:'M93 68 V106 M219 68 V106',fill:'none',stroke:'#9A86AD',strokeWidth:1,opacity:.6 },
    { kind:'path',d:'M130 180 H182',fill:'none',stroke:'#F8EAFF',strokeWidth:1,opacity:.6 },
  ] };
}
