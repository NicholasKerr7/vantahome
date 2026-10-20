import { useId, useRef } from 'react';
import { useFanRotorMotion } from './useFanRotorMotion';

/** A machined three-blade rotor uses a lightweight SVG; the numeric controls remain readable when motion is disabled. */
export function FanConsoleArtwork({ velocity, reduced, extractor }: { velocity: number; reduced: boolean; extractor: boolean }) {
  const id = useId().replace(/:/g, '');
  const rotor = useRef<HTMLDivElement>(null);
  useFanRotorMotion(rotor, velocity, reduced);
  return <div className="fan-instrument" data-running={velocity !== 0} data-extractor={extractor} aria-hidden="true">
    <svg className="fan-bezel" viewBox="0 0 260 260">
      <defs>
        <linearGradient id={`${id}-rim`} x2="1" y2="1"><stop stopColor="#D8CBE7" /><stop offset=".25" stopColor="#655277" /><stop offset=".55" stopColor="#21152D" /><stop offset=".85" stopColor="#A588BD" /><stop offset="1" stopColor="#372344" /></linearGradient>
        <radialGradient id={`${id}-well`}><stop stopColor="#614373" /><stop offset=".65" stopColor="#1F142C" /><stop offset="1" stopColor="#0C0814" /></radialGradient>
      </defs>
      {extractor && <rect x="6" y="6" width="248" height="248" rx="48" fill="#241A31" stroke="#78608C" />}
      <circle cx="130" cy="130" r="121" fill={`url(#${id}-rim)`} stroke="#C0A2D8" />
      <circle cx="130" cy="130" r="114" fill="#100B18" stroke="#55405F" strokeWidth="2" />
      <circle cx="130" cy="130" r="106" fill={`url(#${id}-well)`} stroke="#7D5D94" />
      <circle className="fan-signal-ring" cx="130" cy="130" r="110" fill="none" strokeWidth="2" />
      <g stroke="#C1A8D1" strokeWidth="2" opacity=".5">
        {Array.from({ length: 24 }, (_, i) => <path key={i} d="M130 15 V19" transform={`rotate(${i * 15} 130 130)`} />)}
      </g>
    </svg>
    <div ref={rotor} className="fan-rotor">
      <svg viewBox="0 0 260 260">
        <defs>
          <linearGradient id={`${id}-blade`} x1="0" y1="1" x2="1" y2="0"><stop stopColor="#271831" /><stop offset=".35" stopColor="#735A87" /><stop offset=".7" stopColor="#C8B5D8" /><stop offset="1" stopColor="#826397" /></linearGradient>
        </defs>
        {[0, 120, 240].map((angle) => <g key={angle} transform={`rotate(${angle} 130 130)`}>
          <path d="M119 120 C91 95 71 56 82 38 C89 28 113 27 128 35 C149 48 132 79 140 113 L134 133 Z" fill={`url(#${id}-blade)`} stroke="#BA9ACD" strokeWidth="1.2" />
          <path d="M89 42 C96 68 115 95 126 115" fill="none" stroke="#E3D0EE" opacity=".5" />
        </g>)}
      </svg>
    </div>
    <svg className="fan-hub" viewBox="0 0 260 260">
      <defs><radialGradient id={`${id}-hub`} cx=".35" cy=".25"><stop stopColor="#E6D4F1" /><stop offset=".35" stopColor="#9C80AE" /><stop offset=".75" stopColor="#4E365E" /><stop offset="1" stopColor="#24152F" /></radialGradient></defs>
      <circle cx="130" cy="130" r="30" fill="#130D1B" stroke="#B68CCD" />
      <circle cx="130" cy="130" r="24" fill={`url(#${id}-hub)`} stroke="#C7A4DD" />
      <path d="M120 126 L130 138 L140 126" fill="none" stroke="#E4CCF2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {extractor && <g fill="none" stroke="#B39BC4" opacity=".35"><circle cx="130" cy="130" r="66" /><circle cx="130" cy="130" r="91" /></g>}
    </svg>
  </div>;
}
