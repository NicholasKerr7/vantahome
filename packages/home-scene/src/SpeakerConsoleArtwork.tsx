import { useId } from 'react';

/** A lightweight studio speaker lights only for an audible local playback state. */
export function SpeakerConsoleArtwork({ active }: { active: boolean }) {
  const prefix = useId().replace(/:/g, '');
  return <svg className="speaker-artwork" viewBox="0 0 280 190" aria-hidden="true">
    <defs>
      <linearGradient id={`${prefix}-body`} x1="0" y1="0" x2="1" y2=".2">
        <stop stopColor="#AB98BE" /><stop offset=".11" stopColor="#4E3C60" /><stop offset=".47" stopColor="#191121" /><stop offset=".84" stopColor="#35263F" /><stop offset="1" stopColor="#776187" />
      </linearGradient>
      <radialGradient id={`${prefix}-cone`}>
        <stop stopColor="#92819D" /><stop offset=".2" stopColor="#51425D" /><stop offset=".24" stopColor="#1B1323" /><stop offset=".65" stopColor="#35283F" /><stop offset=".85" stopColor="#14101B" /><stop offset="1" stopColor="#897097" />
      </radialGradient>
      <linearGradient id={`${prefix}-cap`} x2="0" y2="1">
        <stop stopColor="#B7A1C9" /><stop offset=".28" stopColor="#675373" /><stop offset="1" stopColor="#2C2036" />
      </linearGradient>
      <pattern id={`${prefix}-mesh`} width="5" height="5" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r=".7" fill="#BCA5CE" opacity=".22" />
      </pattern>
    </defs>
    <ellipse cx="140" cy="177" rx="77" ry="10" fill="#08040E" opacity=".7" />
    <path d="M85 34 C85 7 195 7 195 34 V157 C195 184 85 184 85 157 Z" fill={`url(#${prefix}-body)`} stroke="#9F86B4" strokeWidth="1.4" />
    <ellipse cx="140" cy="33" rx="55" ry="19" fill={`url(#${prefix}-cap)`} stroke="#C7ACDA" strokeWidth="1.1" />
    <ellipse cx="140" cy="32" rx="43" ry="12" fill="#291B34" stroke="#6D537E" />
    <path d="M129 32 H151 M140 28 V36" stroke="#CCB5DC" strokeWidth="1.4" strokeLinecap="round" />
    <path d="M90 47 Q140 70 190 47 V154 Q140 179 90 154 Z" fill={`url(#${prefix}-mesh)`} />
    <ellipse cx="140" cy="80" rx="22" ry="21" fill={`url(#${prefix}-cone)`} stroke="#A58AB5" strokeWidth="1.3" />
    <ellipse cx="140" cy="80" rx="8" ry="7" fill="#18101F" stroke="#756082" />
    <ellipse cx="140" cy="131" rx="35" ry="31" fill={`url(#${prefix}-cone)`} stroke="#A58AB5" strokeWidth="1.3" />
    <ellipse cx="140" cy="131" rx="12" ry="10" fill="#35263E" stroke="#776284" />
    <path className="speaker-light-ring" d="M91 157 Q140 180 189 157" fill="none" stroke={active ? '#DAB0FF' : '#685775'} strokeWidth={active ? '3' : '1.5'} strokeLinecap="round" />
    <path d="M94 54 V146" stroke="#C8AFD9" opacity=".35" />
    <path d="M187 57 V148" stroke="#0C0612" strokeWidth="3" opacity=".7" />
  </svg>;
}
