import { useId, useRef } from 'react';
import { useDeviceRotorMotion } from './useDeviceRotorMotion';

/** A glass cutaway visualizes accepted activity without pretending to show a sensor or cycle phase. */
export function DishwasherConsoleArtwork({ running, reduced }: { running: boolean; reduced: boolean }) {
  const id = useId().replace(/:/g, '');
  const spray = useRef<HTMLDivElement>(null);
  useDeviceRotorMotion(spray, running ? 0.85 : 0, reduced);
  return <div className="dishwasher-artwork" data-running={running} aria-hidden="true">
    <svg className="dishwasher-cabinet" viewBox="0 0 320 260">
      <defs>
        <linearGradient id={`${id}-case`} x2="1" y2="1"><stop stopColor="#D6C8E2" /><stop offset=".18" stopColor="#685973" /><stop offset=".58" stopColor="#231A2E" /><stop offset=".84" stopColor="#877092" /><stop offset="1" stopColor="#382741" /></linearGradient>
        <linearGradient id={`${id}-face`} x2=".6" y2="1"><stop stopColor="#51465E" /><stop offset=".3" stopColor="#261E31" /><stop offset="1" stopColor="#0F0A18" /></linearGradient>
        <radialGradient id={`${id}-chamber`}><stop stopColor="#49315E" /><stop offset="1" stopColor="#100B1B" /></radialGradient>
        <linearGradient id={`${id}-plate`}><stop stopColor="#E4D8EF" /><stop offset=".4" stopColor="#9A8BA8" /><stop offset="1" stopColor="#51415E" /></linearGradient>
      </defs>
      <ellipse cx="165" cy="247" rx="122" ry="10" fill="#08030E" opacity=".7" />
      <path d="M55 12 H267 L279 24 V238 L267 246 H55Z" fill={`url(#${id}-case)`} stroke="#A38CB4" />
      <rect x="44" y="12" width="224" height="228" rx="17" fill={`url(#${id}-face)`} stroke="#C3ACD2" />
      <path d="M55 51 H257 M58 226 H254" stroke="#A68AB9" strokeOpacity=".4" />
      <rect x="67" y="26" width="101" height="7" rx="3.5" fill="#100A18" stroke="#897297" />
      <path className="dishwasher-signal" d="M198 31 H217 M227 31 H242" strokeWidth="3" strokeLinecap="round" />
      <rect x="61" y="61" width="190" height="154" rx="13" fill={`url(#${id}-chamber)`} stroke="#8E739F" />
      <path d="M72 73 H240 V202 H72Z M73 73 L89 87 H224 L240 73 M72 202 L89 188 H224 L240 202" fill="none" stroke="#766086" strokeOpacity=".5" />
      {[0, 1, 2, 3, 4, 5].map((index) => <g key={index}>
        <ellipse cx={97 + index * 24} cy="160" rx="10" ry="30" fill={`url(#${id}-plate)`} stroke="#CDBADC" strokeWidth=".7" />
        <ellipse cx={97 + index * 24} cy="160" rx="6" ry="24" fill="none" stroke="#44314E" strokeWidth=".8" />
      </g>)}
      {[94, 125, 156, 187, 218].map((x) => <g key={x}>
        <path d={`M${x - 9} 86 L${x - 6} 112 Q${x} 118 ${x + 6} 112 L${x + 9} 86Z`} fill="#B7A5CE" fillOpacity=".35" stroke="#C2ADD8" strokeWidth=".8" />
        <ellipse cx={x} cy="86" rx="9" ry="3" fill="#24182F" stroke="#A992BC" />
      </g>)}
      <path d="M78 117 H235 L228 126 H86Z M76 185 H237 L229 197 H84Z" fill="#382741" fillOpacity=".6" stroke="#A189B2" />
      {[88, 112, 136, 160, 184, 208, 232].map((x) => <path key={x} d={`M${x} 117 V126 M${x} 185 V197`} stroke="#B69AC8" strokeOpacity=".5" />)}
      <path className="dishwasher-jets" d="M88 178 Q104 147 87 130 M116 179 Q126 153 115 134 M146 179 Q151 149 145 132 M177 179 Q171 151 180 133 M205 179 Q193 151 210 131 M228 177 Q212 149 230 130" fill="none" stroke="#D1ADFF" strokeWidth="1.4" strokeDasharray="2 6" strokeLinecap="round" />
    </svg>
    <div className="dishwasher-spray-plane"><div ref={spray} className="dishwasher-spray">
      <svg viewBox="0 0 100 100"><path d="M7 46 Q50 41 93 46 L93 54 Q50 59 7 54Z" fill="#A48AB8" stroke="#DCC1EF" />
        <path d="M15 49 H35 M66 51 H84" stroke="#F1D9FF" strokeWidth="2" />
        <circle cx="50" cy="50" r="7" fill="#463155" stroke="#D6B7EA" />
      </svg>
    </div></div>
    <svg className="dishwasher-glass" viewBox="0 0 320 260">
      <rect x="61" y="61" width="190" height="154" rx="13" fill="#9F73D1" fillOpacity=".055" />
      <path d="M75 65 H144 L76 153Z" fill="#EEE0FF" opacity=".07" />
      <path d="M69 207 H243" className="dishwasher-signal" strokeWidth="2" strokeLinecap="round" />
      <path d="M63 73 Q63 62 76 62 H238" fill="none" stroke="#E5CCF3" opacity=".5" />
    </svg>
  </div>;
}
