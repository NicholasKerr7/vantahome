import { useId, useRef } from 'react';
import { useFanRotorMotion } from './useFanRotorMotion';
import { CeilingFanConsoleArtwork } from './CeilingFanConsoleArtwork';

/** Select the equipment silhouette without changing the device's controls or motion permissions. */
export function FanConsoleArtwork({ velocity, reduced, extractor }: { velocity: number; reduced: boolean; extractor: boolean }) {
  return extractor ? <ExtractorFanConsoleArtwork velocity={velocity} reduced={reduced} />
    : <CeilingFanConsoleArtwork velocity={velocity} reduced={reduced} />;
}

/** A machined rotor sits behind a fixed extractor grille; only the existing rotor layer moves. */
function ExtractorFanConsoleArtwork({ velocity, reduced }: { velocity: number; reduced: boolean }) {
  const id = useId().replace(/:/g, '');
  const rotor = useRef<HTMLDivElement>(null);
  useFanRotorMotion(rotor, velocity, reduced);
  return <div className="fan-instrument" data-running={velocity !== 0} data-extractor="true" aria-hidden="true">
    <svg className="fan-bezel" viewBox="0 0 260 260">
      <defs>
        <linearGradient id={`${id}-rim`} x2="1" y2="1"><stop stopColor="#D8CBE7" /><stop offset=".25" stopColor="#655277" /><stop offset=".55" stopColor="#21152D" /><stop offset=".85" stopColor="#A588BD" /><stop offset="1" stopColor="#372344" /></linearGradient>
        <radialGradient id={`${id}-well`}><stop stopColor="#614373" /><stop offset=".65" stopColor="#1F142C" /><stop offset="1" stopColor="#0C0814" /></radialGradient>
      </defs>
      <>
        <rect x="6" y="6" width="248" height="248" rx="38" fill={`url(#${id}-rim)`} stroke="#C0A2D8" />
        <rect x="14" y="14" width="232" height="232" rx="32" fill="#241A31" stroke="#897099" />
        <path d="M43 20 H217 Q240 20 240 43" fill="none" stroke="#E7D5F4" opacity=".35" />
        <circle cx="130" cy="130" r="104" fill="#100B18" stroke="#8B6CA0" strokeWidth="2" />
        <circle cx="130" cy="130" r="98" fill={`url(#${id}-well)`} stroke="#48314E" />
        <circle className="fan-signal-ring" cx="130" cy="130" r="101" fill="none" strokeWidth="2" />
        {[36, 224].flatMap((x) => [36, 224].map((y) => <g key={`${x}-${y}`}>
          <circle cx={x} cy={y} r="4" fill="#130D1C" stroke="#9B83AE" />
          <path d={`M${x - 2} ${y} H${x + 2}`} stroke="#877195" />
        </g>))}
        <path className="fan-signal-ring" d="M116 240 H144" fill="none" strokeWidth="3" strokeLinecap="round" />
      </>
    </svg>
    <div ref={rotor} className="fan-rotor">
      <svg viewBox="0 0 260 260">
        <defs>
          <linearGradient id={`${id}-blade`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#271831" /><stop offset=".35" stopColor="#735A87" /><stop offset=".7" stopColor="#C8B5D8" /><stop offset="1" stopColor="#826397" /></linearGradient>
        </defs>
        <g transform="translate(130 130) scale(.87) translate(-130 -130)">
        {[0, 120, 240].map((angle) => <g key={angle} transform={`rotate(${angle} 130 130)`}>
          <path d="M119 120 C91 95 71 56 82 38 C89 28 113 27 128 35 C149 48 132 79 140 113 L134 133 Z" fill={`url(#${id}-blade)`} stroke="#BA9ACD" strokeWidth="1.2" />
          <path d="M89 42 C96 68 115 95 126 115" fill="none" stroke="#E3D0EE" opacity=".5" />
        </g>)}
        </g>
      </svg>
    </div>
    <svg className="fan-hub" viewBox="0 0 260 260">
      <defs><radialGradient id={`${id}-hub`} cx=".35" cy=".25"><stop stopColor="#E6D4F1" /><stop offset=".35" stopColor="#9C80AE" /><stop offset=".75" stopColor="#4E365E" /><stop offset="1" stopColor="#24152F" /></radialGradient></defs>
      <g className="fan-extractor-grille" fill="none" stroke="#A78CB9">
        {[46, 62, 78, 94].map((radius) => <circle key={radius} cx="130" cy="130" r={radius} strokeWidth="2" opacity=".6" />)}
        {[0, 45, 90, 135].map((angle) => <g key={angle} transform={`rotate(${angle} 130 130)`}>
          <path d="M34 130 H226" stroke="#100A16" strokeWidth="6" />
          <path d="M34 129 H226" strokeWidth="2" opacity=".75" />
        </g>)}
      </g>
      <circle cx="130" cy="130" r="30" fill="#130D1B" stroke="#B68CCD" />
      <circle cx="130" cy="130" r="24" fill={`url(#${id}-hub)`} stroke="#C7A4DD" />
      <path d="M120 126 L130 138 L140 126" fill="none" stroke="#E4CCF2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>;
}
