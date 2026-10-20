import { useId } from 'react';
import type { WaterControllerState } from './waterController';

/** Sculpt the configured heater body without inventing tank levels or measured heat. */
function HeaterArtwork({ metal, glass, powered }: { metal: string; glass: string; powered: boolean }) {
  return <g>
    <path d="M91 39 V20 H76 M133 39 V20 H149" fill="none" stroke="#8B789D" strokeWidth="9" strokeLinejoin="round" />
    <path d="M91 33 V20 H76 M133 33 V20 H149" fill="none" stroke="#D4C0E3" strokeWidth="3" strokeLinejoin="round" />
    <path d="M66 51 C66 23 158 23 158 51 V179 C158 206 66 206 66 179 Z" fill={`url(#${metal})`} stroke="#B39AC5" />
    <ellipse cx="112" cy="51" rx="46" ry="20" fill="#564363" stroke="#C2A8D3" />
    <ellipse cx="112" cy="49" rx="35" ry="12" fill="#32283E" stroke="#887494" />
    <path d="M73 67 V174 C73 182 78 186 83 188 M149 66 V174" fill="none" stroke="#F0DDFB" strokeOpacity=".2" strokeWidth="2" />
    <path d="M66 168 C75 192 149 192 158 168" fill="none" stroke="#160F23" strokeWidth="3" />
    <rect x="94" y="78" width="37" height="72" rx="12" fill={`url(#${glass})`} stroke="#82708D" />
    <rect x="100" y="85" width="25" height="27" rx="6" fill="#100B1A" stroke="#584569" />
    <path d="M107 105 V94 M112 105 V90 M117 105 V96" stroke={powered ? '#D6B7FF' : '#63556F'} strokeWidth="2" strokeLinecap="round" />
    <circle cx="112" cy="130" r="7" fill="#21162F" stroke="#A88AC2" />
    <circle cx="112" cy="130" r="2.5" fill={powered ? '#E9BBA7' : '#74617E'} />
    <path d="M79 76 V152" stroke={powered ? '#DBB3E8' : '#6D5B7E'} strokeWidth="3" strokeLinecap="round" />
    <path d="M86 199 V208 M140 199 V208" stroke="#9580A8" strokeWidth="6" />
  </g>;
}

/** Render a meter instrument with pipe connections; the face never implies a valve actuator. */
function MeterArtwork({ metal, glass }: { metal: string; glass: string }) {
  return <g>
    <path d="M28 122 H69 M153 122 H196" stroke="#2D203D" strokeWidth="27" />
    <path d="M28 118 H69 M153 118 H196" stroke="#93809F" strokeWidth="19" />
    <path d="M28 113 H69 M153 113 H196" stroke="#D5C4E0" strokeOpacity=".5" strokeWidth="4" />
    {[36, 53, 173, 190].map((x) => <rect key={x} x={x} y="104" width="7" height="32" rx="2" fill="#685374" stroke="#B09AC0" />)}
    <path d="M70 142 L70 160 Q112 182 154 160 V140" fill={`url(#${metal})`} stroke="#9B85AC" />
    <ellipse cx="112" cy="119" rx="58" ry="59" fill={`url(#${metal})`} stroke="#BEA5D4" strokeWidth="1.5" />
    <ellipse cx="112" cy="115" rx="49" ry="50" fill={`url(#${glass})`} stroke="#D7B9F3" strokeOpacity=".65" />
    <circle cx="112" cy="115" r="41" fill="#140E20" stroke="#534165" />
    <path d="M79 126 A35 35 0 1 1 144 126" fill="none" stroke="#79638F" strokeWidth="3" />
    <path d="M80 126 A35 35 0 0 1 99 82" fill="none" stroke="#C3A3F3" strokeWidth="3" strokeLinecap="round" />
    <path d="M112 91 C109 97 102 102 102 109 A10 10 0 0 0 122 109 C122 102 115 97 112 91Z" fill="#C0B6EA" />
    <rect x="93" y="126" width="38" height="9" rx="3" fill="#372A49" stroke="#78638D" />
    <path d="M100 130 H124" stroke="#BCA9D0" strokeWidth="2" strokeDasharray="2 3" />
    <circle cx="112" cy="66" r="2" fill="#DDC9F0" />
    <circle cx="112" cy="166" r="2" fill="#DDC9F0" />
  </g>;
}

/** One lightweight SVG changes with accepted power only; no extra renderer or idle animation. */
export function WaterConsoleArtwork({ water }: { water: WaterControllerState }) {
  const id = useId().replace(/:/g, '');
  const metal = `${id}-water-metal`;
  const glass = `${id}-water-glass`;
  return <svg className="water-artwork" viewBox="0 0 224 224" aria-hidden="true">
    <defs>
      <linearGradient id={metal} x1="0" x2="1" y1=".2" y2=".8">
        <stop stopColor="#62566D" /><stop offset=".24" stopColor="#C2AFCD" /><stop offset=".42" stopColor="#695678" /><stop offset=".84" stopColor="#30223F" /><stop offset="1" stopColor="#7F6692" />
      </linearGradient>
      <linearGradient id={glass} x1="0" y1="0" x2="1" y2="1"><stop stopColor="#594168" /><stop offset=".5" stopColor="#21182E" /><stop offset="1" stopColor="#342640" /></linearGradient>
    </defs>
    <ellipse cx="112" cy="209" rx="79" ry="11" fill="#080411" opacity=".6" />
    <path d="M30 202 Q112 224 194 202" fill="none" stroke="#9270B4" strokeOpacity=".3" />
    {water.kind === 'water-heater' ? <HeaterArtwork metal={metal} glass={glass} powered={water.on} /> : <MeterArtwork metal={metal} glass={glass} />}
  </svg>;
}
