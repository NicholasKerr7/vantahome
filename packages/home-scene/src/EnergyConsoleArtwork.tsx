import { useId } from 'react';
import type { EnergyControllerState } from './energyController';

/** Static meter circuitry suggests the appliance's connections without claiming measured flow direction. */
function MeterArtwork({ gradient, available }: { gradient: string; available: boolean | null }) {
  return <g>
    <path d="M44 126 L44 99 L78 84 M196 126 L196 99 L162 84" fill="none" stroke="#69547D" strokeWidth={2} />
    <circle cx={44} cy={126} r={5} fill="#BA9CDA" /><circle cx={196} cy={126} r={5} fill="#BA9CDA" />
    <path d="M78 42 L120 24 L164 42 L164 110 L120 133 L78 111 Z" fill={`url(#${gradient})`} stroke="#9C80B3" />
    <path d="M78 42 L120 62 L164 42 M120 62 L120 133" fill="none" stroke="#A68BBB" opacity={0.65} />
    <path d="M90 53 L113 64 L113 96 L90 85 Z" fill="#130F1D" stroke="#77608D" />
    <path d="M95 63 L109 70 M95 69 L109 76 M95 75 L105 80" stroke={available ? '#DCC6FF' : '#75657B'} strokeWidth={2} />
    <path d="M129 70 L151 59 L151 87 L129 99 Z" fill="#21182F" stroke="#6E557F" />
    <circle cx={139} cy={82} r={4} fill={available ? '#CCAEF7' : '#706475'} />
    <path d="M89 103 L112 114 M129 116 L153 104" stroke="#77608D" strokeWidth={2} />
  </g>;
}

/** The battery face shows only its sampled charge; there is no animated charging or reserve movement. */
function BatteryArtwork({ gradient, charge }: { gradient: string; charge: number | null }) {
  const fillHeight = charge === null ? 0 : Math.max(0, Math.min(100, charge)) * 0.57;
  return <g>
    <path d="M85 38 L125 22 L159 39 L159 122 L119 140 L85 122 Z" fill={`url(#${gradient})`} stroke="#A88CC0" />
    <path d="M85 38 L119 55 L159 39 M119 55 L119 140" fill="none" stroke="#A88CC0" opacity={0.6} />
    <path d="M101 30 L122 21 L139 29 L118 38 Z" fill="#C4AED8" stroke="#E0CFEB" />
    <rect x={128} y={61} width={21} height={59} rx={3} fill="#160F20" stroke="#756183" />
    <rect data-testid="energy-battery-charge-fill" x={130} y={119 - fillHeight} width={17} height={fillHeight} rx={2} fill="#B18CDD" />
    <path d="M128 79 L149 79 M128 99 L149 99" stroke="#342641" strokeWidth={2} />
    <path d="M96 65 L106 70 L100 81 L108 86 L95 104 L99 89 L92 85 Z" fill="#D5BCED" opacity={0.7} />
  </g>;
}

/** An isometric panel grid represents this solar sample without implying live sunlight or generation speed. */
function SolarArtwork({ gradient }: { gradient: string }) {
  return <g>
    <path d="M72 106 L72 132 M163 100 L163 127 M59 136 L83 136 M151 131 L175 131" stroke="#8E739F" strokeWidth={4} />
    <path d="M43 65 L158 32 L198 91 L81 125 Z" fill={`url(#${gradient})`} stroke="#C7ACDF" strokeWidth={2} />
    <path d="M49 67 L156 37 L191 88 L83 119 Z" fill="#32274C" stroke="#9C7DC3" />
    <path d="M74 59 L109 111 M101 52 L136 104 M129 44 L163 96 M60 84 L168 53 M71 101 L180 71" stroke="#AB87D0" strokeWidth={1} opacity={0.8} />
    <path d="M44 68 L80 127 L198 93" fill="none" stroke="#756080" strokeWidth={3} />
    <path d="M55 68 L149 42" stroke="#E3CBF5" strokeWidth={1} opacity={0.75} />
  </g>;
}

/** The generator indicator follows confirmed power while its static enclosure makes no motor-state claim. */
function GeneratorArtwork({ gradient, on }: { gradient: string; on: boolean }) {
  return <g>
    <path d="M52 65 L135 38 L188 61 L188 115 L104 143 L52 120 Z" fill={`url(#${gradient})`} stroke="#A78DB7" />
    <path d="M52 65 L104 88 L188 61 M104 88 L104 143" fill="none" stroke="#BBA0CE" opacity={0.65} />
    <path d="M86 52 L86 40 L123 29 L151 40 L151 48" fill="none" stroke="#BD9FD2" strokeWidth={4} />
    <path d="M118 94 L174 76 L174 112 L118 130 Z" fill="#17121F" stroke="#685374" />
    <path d="M125 95 L167 82 M125 102 L167 89 M125 109 L167 96 M125 116 L167 103" stroke="#80658E" strokeWidth={2} />
    <path d="M62 79 L92 92 L92 114 L62 101 Z" fill="#20172B" stroke="#786186" />
    <circle cx={73} cy={94} r={4} fill={on ? '#D4B4F8' : '#6B5D75'} />
    <path d="M61 122 L61 132 M174 121 L174 132" stroke="#A78DB7" strokeWidth={5} />
  </g>;
}

/** Render selected-device equipment without invented power flow or another 3D renderer. */
export function EnergyConsoleArtwork({ energy }: { energy: EnergyControllerState }) {
  const gradient = `${useId()}-energy-metal`;
  return <svg className="energy-artwork" viewBox="0 0 240 160" aria-hidden="true" data-kind={energy.kind}>
    <defs><linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
      <stop stopColor="#8E77A5" /><stop offset=".45" stopColor="#493953" /><stop offset="1" stopColor="#21172E" />
    </linearGradient></defs>
    <ellipse cx="120" cy="139" rx="91" ry="15" fill="#100B17" opacity=".7" />
    <path d="M33 128 L117 151 L208 127" fill="none" stroke="#82639A" strokeWidth="1" opacity=".5" />
    {energy.kind === 'energy' && <MeterArtwork gradient={gradient} available={energy.gridAvailable} />}
    {energy.kind === 'battery' && <BatteryArtwork gradient={gradient} charge={energy.chargePercent} />}
    {energy.kind === 'solar' && <SolarArtwork gradient={gradient} />}
    {energy.kind === 'generator' && <GeneratorArtwork gradient={gradient} on={energy.on} />}
  </svg>;
}
