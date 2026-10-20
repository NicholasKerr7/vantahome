import { useId } from 'react';
import type { VacuumControllerState } from './vacuumController';

/** A fixed robot and dock illustrate accepted activity without inventing position or a cleaning route. */
export function VacuumConsoleArtwork({ vacuum }: { vacuum: VacuumControllerState }) {
  const id = useId().replace(/:/g, '');
  const metal = `${id}-vacuum-metal`;
  const glass = `${id}-vacuum-glass`;
  return <svg className="vacuum-artwork" viewBox="0 0 300 190" aria-hidden="true">
    <defs>
      <linearGradient id={metal} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#D2C4E0" /><stop offset=".18" stopColor="#81748F" /><stop offset=".55" stopColor="#32283F" /><stop offset=".82" stopColor="#655374" /><stop offset="1" stopColor="#271D36" />
      </linearGradient>
      <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#80718E" /><stop offset=".35" stopColor="#30243E" /><stop offset="1" stopColor="#100B1B" />
      </linearGradient>
    </defs>
    <ellipse cx="150" cy="169" rx="119" ry="15" fill="#090511" opacity=".7" />
    <path d="M91 79 V29 Q91 18 104 18 H196 Q209 18 209 29 V79 L195 91 H104Z" fill={`url(#${glass})`} stroke="#9C87B1" />
    <path d="M106 26 H195 M102 33 V63 M199 33 V63" fill="none" stroke="#C4AED8" strokeOpacity=".25" />
    <rect x="137" y="32" width="26" height="3" rx="1.5" fill={vacuum.activity === 'docked' ? '#D7B5FA' : '#60516F'} />
    <path d="M106 60 H194 L220 90 H80Z" fill="#292031" stroke="#74617E" />
    <path d="M61 116 Q56 162 150 173 Q244 162 239 116Z" fill={`url(#${metal})`} stroke="#8E7B9D" />
    <ellipse cx="150" cy="115" rx="90" ry="51" fill={`url(#${metal})`} stroke="#D4C0E7" strokeWidth="1.5" />
    <ellipse cx="150" cy="110" rx="83" ry="46" fill={`url(#${glass})`} stroke="#9C86AE" />
    <ellipse className="vacuum-activity-ring" cx="150" cy="110" rx="76" ry="40" fill="none" stroke={vacuum.on ? '#C9A3FF' : '#675275'} strokeWidth="2" />
    <path d="M83 109 Q84 81 127 74 M169 73 Q207 78 218 101" fill="none" stroke="#F2E7FB" strokeOpacity=".2" strokeWidth="2" />
    <path d="M114 128 Q150 143 187 127" fill="none" stroke="#0B0712" strokeWidth="2" />
    <path d="M124 92 V103 Q150 119 176 103 V92" fill={`url(#${metal})`} stroke="#A28BAF" />
    <ellipse cx="150" cy="91" rx="26" ry="16" fill={`url(#${glass})`} stroke="#CFB5E3" />
    <ellipse cx="150" cy="90" rx="18" ry="10" fill="#24182F" stroke="#8F6FB1" />
    <path d="M142 90 H158" stroke={vacuum.on ? '#E6CEFF' : '#9B82AD'} strokeWidth="2" strokeLinecap="round" />
    <rect x="178" y="112" width="17" height="6" rx="3" fill="#20142E" stroke="#79608D" />
    <circle cx="183" cy="115" r="1.5" fill={vacuum.on ? '#E1C5FC' : '#796487'} />
    <path d="M105 157 Q150 175 195 157" fill="none" stroke="#140D1E" strokeWidth="6" strokeLinecap="round" />
    <path d="M111 158 Q150 171 189 158" fill="none" stroke="#79638D" strokeWidth="1" />
    <path d="M61 134 L43 137 M64 138 L50 147 M239 134 L257 137 M236 138 L250 147" stroke="#AF95C4" strokeWidth="2" strokeLinecap="round" />
  </svg>;
}
