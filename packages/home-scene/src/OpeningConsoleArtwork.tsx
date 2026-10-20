import { useId } from 'react';
import type { OpeningDeviceKind } from './openingController';

/** A projected architectural model mirrors the authored hinge or shutter, not a physical motor. */
export function OpeningConsoleArtwork({ kind, position }: { kind: OpeningDeviceKind; position: number | null }) {
  const id = useId();
  const fraction = (position ?? 0) / 100;
  const shutter = kind === 'garage';
  const window = kind === 'window';
  const width = shutter ? 224 : window ? 206 : 144;
  const left = (320 - width) / 2;
  const top = window ? 53 : 24;
  const height = window ? 144 : 195;
  const angle = fraction * Math.PI / 3;
  return <svg className="opening-artwork" viewBox="0 0 320 260" aria-hidden="true" data-kind={kind} data-known={position !== null}>
    <defs>
      <linearGradient id={`${id}-frame`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#C9B5DB" /><stop offset=".09" stopColor="#55475F" /><stop offset=".5" stopColor="#191120" /><stop offset="1" stopColor="#A28DAF" /></linearGradient>
      <linearGradient id={`${id}-leaf`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#58415D" /><stop offset=".38" stopColor="#302335" /><stop offset="1" stopColor="#17121F" /></linearGradient>
      <linearGradient id={`${id}-slat`} x1="0" y1="0" x2="0" y2="1"><stop stopColor="#B6A1C9" /><stop offset=".2" stopColor="#75627F" /><stop offset=".82" stopColor="#40334C" /><stop offset="1" stopColor="#22182E" /></linearGradient>
      <linearGradient id={`${id}-glass`} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#DBCCEA" stopOpacity=".42" /><stop offset=".5" stopColor="#8E6BB5" stopOpacity=".2" /><stop offset="1" stopColor="#271832" stopOpacity=".9" /></linearGradient>
      <radialGradient id={`${id}-light`}><stop stopColor="#C88CFF" stopOpacity=".35" /><stop offset="1" stopColor="#B46BFF" stopOpacity="0" /></radialGradient>
    </defs>
    <ellipse cx="160" cy="228" rx="144" ry="25" fill={`url(#${id}-light)`} />
    <path d="M21 230H299M61 245H259M75 212L40 248M245 212L280 248" stroke="#BA8BE7" strokeOpacity=".12" />
    <rect x={left - 13} y={top - 13} width={width + 26} height={height + 26} rx="10" fill={`url(#${id}-frame)`} stroke="#BDA4CD" strokeWidth=".8" />
    <rect x={left - 4} y={top - 4} width={width + 8} height={height + 8} rx="4" fill="#100A18" stroke="#07030B" strokeWidth="5" />
    <rect x={left} y={top} width={width} height={height} fill="#130B20" />
    <path d={`M${left} ${top + height} L160 ${top + height - 44} L${left + width} ${top + height}`} fill="#32253E" stroke="#9F7EBD" strokeOpacity=".3" />
    <path d={`M${left + 10} ${top + 8} H${left + width - 10} V${top + height - 8}`} fill="none" stroke="#C88CFF" strokeWidth="2" opacity={position === null ? 0 : fraction * .7} className="opening-light" />
    {position === null ? <text x="160" y="126" textAnchor="middle" fill="#D8C1E8" fontSize="36">—</text> : shutter ? <g className="opening-moving-part" transform={`translate(${left} ${top}) scale(1 ${1 - fraction * .982})`}>
      {Array.from({ length: 16 }, (_, index) => <rect key={index} x="0" y={index * height / 16} width={width} height={height / 16} rx="1" fill={`url(#${id}-slat)`} stroke="#23182C" strokeWidth=".5" />)}
      <path d={`M2 ${height - 3}H${width - 2}`} stroke="#C0ACD2" strokeWidth="3" />
    </g> : window ? <g className="opening-moving-part" transform={`translate(${left} ${top}) matrix(1 0 ${fraction * .12} ${Math.cos(angle)} 0 0)`}>
      <rect width={width} height={height} rx="2" fill={`url(#${id}-glass)`} stroke="#B6A1CA" strokeWidth="5" />
      <path d={`M16 3L83 ${height - 3}M35 3L102 ${height - 3}`} stroke="#EDDAFF" strokeWidth="13" opacity=".13" />
      <path d={`M${width / 2 - 14} ${height - 9}h28`} stroke="#DECDEE" strokeWidth="4" />
    </g> : <g className="opening-moving-part" transform={`translate(${left} ${top}) matrix(${Math.max(.09, Math.cos(fraction * Math.PI / 2))} ${fraction * .24} 0 1 0 0)`}>
      <rect width={width} height={height} rx="2" fill={`url(#${id}-leaf)`} stroke="#AD92BD" strokeWidth="2" />
      {[22, 38, 54, 70, 86].map((x) => <path key={x} d={`M${x} 13V${height - 13}`} stroke="#C4A4CF" strokeOpacity=".1" />)}
      <path d={`M${width - 22} 70V121`} stroke="#0A050F" strokeWidth="9" strokeLinecap="round" />
      <path d={`M${width - 24} 68V119`} stroke="#DBC9E9" strokeWidth="4" strokeLinecap="round" />
      <path d="M4 33V49M4 150V166" stroke="#B7A2C9" strokeWidth="4" />
    </g>}
    {shutter && <rect x={left - 6} y={top - 10} width={width + 12} height="13" rx="3" fill={`url(#${id}-frame)`} stroke="#AA8FBF" strokeWidth=".7" />}
    <path d={`M${left - 18} ${top + height + 12}H${left + width + 18}l7 6H${left - 25}Z`} fill={`url(#${id}-frame)`} stroke="#9D83B4" strokeWidth=".7" />
  </svg>;
}
