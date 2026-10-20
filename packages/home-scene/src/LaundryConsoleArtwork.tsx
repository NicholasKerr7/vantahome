import { useId, useRef } from 'react';
import { useDeviceRotorMotion } from './useDeviceRotorMotion';

/** A decorative front-loader drum follows accepted activity, never the saved RPM or sample progress. */
export function LaundryConsoleArtwork({ running, reduced, dryer }: { running: boolean; reduced: boolean; dryer: boolean }) {
  const id = useId().replace(/:/g, '');
  const drum = useRef<HTMLDivElement>(null);
  useDeviceRotorMotion(drum, running ? 1.1 : 0, reduced);
  return <div className="laundry-machine" data-running={running} data-dryer={dryer} aria-hidden="true">
    <svg className="laundry-housing" viewBox="0 0 260 260">
      <defs>
        <linearGradient id={`${id}-case`} x2="1" y2="1"><stop stopColor="#CCBDDA" /><stop offset=".16" stopColor="#6B5A7A" /><stop offset=".55" stopColor="#241B31" /><stop offset=".83" stopColor="#65516F" /><stop offset="1" stopColor="#20162C" /></linearGradient>
        <linearGradient id={`${id}-face`} x2="1" y2="1"><stop stopColor="#554460" /><stop offset=".45" stopColor="#292033" /><stop offset="1" stopColor="#140E1F" /></linearGradient>
        <linearGradient id={`${id}-rim`} x2=".8" y2="1"><stop stopColor="#EADAF4" /><stop offset=".25" stopColor="#9E87AE" /><stop offset=".55" stopColor="#34243F" /><stop offset=".8" stopColor="#AA90BB" /><stop offset="1" stopColor="#493456" /></linearGradient>
      </defs>
      <ellipse cx="131" cy="248" rx="101" ry="9" fill="#07030C" opacity=".65" />
      <rect x="27" y="13" width="211" height="233" rx="22" fill={`url(#${id}-case)`} stroke="#AC93BD" />
      <rect x="24" y="10" width="207" height="231" rx="21" fill={`url(#${id}-face)`} stroke="#BDA5CF" />
      <path d="M35 60 H219 M39 219 H216" fill="none" stroke="#A78DB9" strokeOpacity=".3" />
      <rect x="40" y="28" width="54" height="16" rx="4" fill="#20152B" stroke="#796088" />
      <path d="M47 34 H83" stroke="#CBB2DC" strokeWidth="2" opacity=".55" />
      <rect x="134" y="25" width="75" height="23" rx="6" fill="#110C19" stroke="#70557E" />
      <path className="laundry-machine-signal" d="M147 36 H173 M181 36 H196" fill="none" strokeWidth="3" strokeLinecap="round" />
      <circle cx="128" cy="140" r="77" fill={`url(#${id}-rim)`} stroke="#D7C0E6" />
      <circle cx="128" cy="140" r="67" fill="#100B19" stroke="#302139" strokeWidth="3" />
      <circle cx="128" cy="140" r="61" fill="#251A31" stroke="#73587F" />
      <path d="M182 101 Q204 137 185 178" fill="none" stroke="#20132B" strokeWidth="8" strokeLinecap="round" />
      <path d="M184 104 Q201 137 187 173" fill="none" stroke="#9F83B3" strokeWidth="2" strokeLinecap="round" />
      <path d="M48 230 H74 M182 230 H208" stroke="#0C0712" strokeWidth="5" strokeLinecap="round" />
    </svg>
    <div className="laundry-drum-window"><div ref={drum} className="laundry-drum">
      <svg viewBox="0 0 120 120">
        <defs><radialGradient id={`${id}-drum`}><stop stopColor="#9D85AE" /><stop offset=".38" stopColor="#65506F" /><stop offset="1" stopColor="#1F142A" /></radialGradient></defs>
        <circle cx="60" cy="60" r="59" fill={`url(#${id}-drum)`} />
        {[0, 120, 240].map((angle) => <g key={angle} transform={`rotate(${angle} 60 60)`}>
          <path d="M57 54 L42 8 Q52 3 62 4 L67 51Z" fill="#A58FB6" stroke="#D4BCE4" strokeOpacity=".6" />
          <path d="M52 13 L61 48" stroke="#F0D9FF" opacity=".5" />
          {[22, 34, 46].map((y) => <g key={y} fill="#1A1023" opacity=".75"><circle cx="75" cy={y} r="2" /><circle cx="84" cy={y + 4} r="2" /><circle cx="93" cy={y + 9} r="2" /></g>)}
        </g>)}
        <circle cx="60" cy="60" r="13" fill="#45314F" stroke="#A88DB9" />
        <circle cx="60" cy="60" r="6" fill="#7E628E" />
      </svg>
    </div></div>
    <svg className="laundry-glass" viewBox="0 0 260 260">
      <circle cx="128" cy="140" r="60" fill="#33204D" opacity=".22" />
      <path d="M78 122 Q85 86 124 84 Q103 112 82 139Z" fill="#E8D1FA" opacity=".15" />
      <path d="M87 186 Q125 207 165 183" fill="none" stroke="#D4B2EF" strokeOpacity=".35" strokeWidth="2" />
    </svg>
  </div>;
}

/** Show the authored installation's positions only, without reading or controlling the other appliance. */
export function LaundryStackIndicator({ dryer }: { dryer: boolean }) {
  return <div className="laundry-stack" aria-label={`Stacked installation. Selected ${dryer ? 'dryer above' : 'washer below'}.`}>
    <span>STACKED</span>
    <div className="laundry-stack-unit" data-selected={dryer}><i aria-hidden="true" /><strong>Dryer</strong></div>
    <div className="laundry-stack-unit" data-selected={!dryer}><i aria-hidden="true" /><strong>Washer</strong></div>
  </div>;
}
