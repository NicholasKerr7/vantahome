import type { EquipmentArtworkDrawing, EquipmentArtworkShape } from './equipmentArtworkGeometry';
import type { SmokeControllerState } from './smokeController';

/** Render a ceramic detector with machined vents and a steady ring tied to accepted incident state. */
export function createSmokeArtwork(prefix: string, tone: SmokeControllerState['tone']): EquipmentArtworkDrawing {
  const signal = tone === 'alarm' ? '#FF967F' : tone === 'warning' ? '#EFC486' : tone === 'unknown' ? '#A69AAD' : '#B795E5';
  const vents: EquipmentArtworkShape[] = Array.from({ length: 22 }, (_, index) => {
    const angle = (index * 360 / 22 - 90) * Math.PI / 180;
    const x = (radius: number) => (160 + Math.cos(angle) * radius).toFixed(2);
    const y = (radius: number) => (107 + Math.sin(angle) * radius * .73).toFixed(2);
    return { kind: 'path', d: `M${x(62)} ${y(62)} L${x(76)} ${y(76)}`, fill: 'none', stroke: '#5B4A6C', strokeWidth: 3 };
  });
  return { viewBox: '0 0 320 220', gradients: [
    { id: `${prefix}-edge`, x2: '80%', y2: '100%', stops: [[0,'#EDE5F4'],[.3,'#766984'],[.6,'#C7B7D7'],[1,'#5F496F']] },
    { id: `${prefix}-ceramic`, kind: 'radial', cx: '36%', cy: '23%', r: '90%', stops: [[0,'#FFF9FF'],[.5,'#DBD2E5'],[1,'#9D8BB0']] },
    { id: `${prefix}-face`, x2: '85%', y2: '100%', stops: [[0,'#F6EEFC'],[.6,'#CDBFDE'],[1,'#B6A1C9']] },
    { id: `${prefix}-core`, kind: 'radial', stops: [[0,'#3B284C'],[.65,'#24172F'],[1,'#0D0814']] },
  ], shapes: [
    { kind:'ellipse',cx:160,cy:194,rx:113,ry:14,fill:'#08040E',opacity:.65 },
    { kind:'ellipse',cx:160,cy:119,rx:111,ry:78,fill:`url(#${prefix}-edge)`,stroke:'#D8C6E6',strokeWidth:1 },
    { kind:'ellipse',cx:160,cy:107,rx:112,ry:79,fill:`url(#${prefix}-ceramic)`,stroke:'#EEE5F8',strokeWidth:1.2 },
    { kind:'ellipse',cx:160,cy:107,rx:98,ry:68,fill:'none',stroke:'#AE9ABD',strokeWidth:.8 },
    ...vents,
    { kind:'ellipse',cx:160,cy:104,rx:55,ry:39,fill:`url(#${prefix}-face)`,stroke:'#F8EFFD',strokeWidth:1 },
    { kind:'ellipse',cx:160,cy:103,rx:37,ry:26,fill:'#4E365F',stroke:signal,strokeWidth:2.5 },
    { kind:'ellipse',cx:160,cy:103,rx:32,ry:22,fill:`url(#${prefix}-core)`,stroke:'#8F74A2',strokeWidth:.8 },
    { kind:'path',d:'M160 90 L170 95 V104 Q170 112 160 117 Q150 112 150 104 V95 Z',fill:'none',stroke:signal,strokeWidth:1.3 },
    { kind:'path',d:'M160 96 V105 M160 109 V111',fill:'none',stroke:'#F0DBFF',strokeWidth:1.2 },
    { kind:'rect',x:148,y:163,width:24,height:4,rx:2,fill:signal,testId:'smoke-preview-signal' },
    { kind:'path',d:'M81 67 Q115 33 169 36',fill:'none',stroke:'#FFFFFF',strokeWidth:1.4,opacity:.65 },
    { kind:'path',d:'M65 151 Q160 208 253 151',fill:'none',stroke:'#CAB6DC',strokeWidth:1,opacity:.6 },
  ] };
}
