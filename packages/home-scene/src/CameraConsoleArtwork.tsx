import { useId } from 'react';

/** Decorative architectural study, deliberately distinct from footage or a calibrated camera view. */
export function CameraConsoleArtwork({ nightVision }: { nightVision: boolean }) {
  const id = useId();
  return <svg className="camera-study" viewBox="0 0 400 250" aria-hidden="true" data-night={nightVision}>
    <defs>
      <linearGradient id={`${id}-sky`} x2="0" y2="1"><stop stopColor="#1D1535" /><stop offset="1" stopColor="#84658B" /></linearGradient>
      <linearGradient id={`${id}-ground`} x2="0" y2="1"><stop stopColor="#413345" /><stop offset="1" stopColor="#15111F" /></linearGradient>
      <linearGradient id={`${id}-wall`}><stop stopColor="#D4C2C7" /><stop offset="1" stopColor="#827387" /></linearGradient>
      <linearGradient id={`${id}-path`} x1=".3" x2=".8" y2="1"><stop stopColor="#8D7B87" /><stop offset="1" stopColor="#342A3D" /></linearGradient>
      <linearGradient id={`${id}-glass`} x2=".2" y2="1"><stop stopColor="#F9D8A8" /><stop offset=".5" stopColor="#B58575" /><stop offset="1" stopColor="#57414F" /></linearGradient>
      <radialGradient id={`${id}-glow`}><stop stopColor="#F1BF88" stopOpacity=".55" /><stop offset="1" stopColor="#F1BF88" stopOpacity="0" /></radialGradient>
      <radialGradient id={`${id}-skyglow`}><stop stopColor="#C69AF9" stopOpacity=".24" /><stop offset="1" stopColor="#C69AF9" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="400" height="250" fill={`url(#${id}-sky)`} />
    <ellipse cx="320" cy="55" rx="165" ry="80" fill={`url(#${id}-skyglow)`} />
    <circle cx="310" cy="35" r="12" fill="#E3CDEA" opacity=".75" /><circle cx="305" cy="31" r="12" fill="#4C365F" />
    <path d="M0 110Q35 82 73 108T144 109T221 105T305 110T400 104V174H0Z" fill="#242434" />
    <path d="M0 147L400 125V250H0Z" fill={`url(#${id}-ground)`} />
    <path d="M223 130L291 140L355 250H137Z" fill={`url(#${id}-path)`} />
    <g stroke="#BDA6B9" strokeOpacity=".2" fill="none"><path d="M209 154L300 163M193 181L315 189M171 216L335 224M246 138L245 250" /></g>
    <path d="M90 95L218 73L302 96V153L173 181L90 151Z" fill="#524757" />
    <path d="M90 95L218 73V152L90 151Z" fill={`url(#${id}-wall)`} />
    <path d="M218 73L302 96V153L218 152Z" fill="#796477" />
    <path d="M78 93L216 66L314 92L304 100L218 80L83 103Z" fill="#D7C7D4" />
    <path d="M84 101L218 79L305 99V105L219 86L84 108Z" fill="#594A65" />
    <path d="M115 116L185 104V154L115 166Z" fill="#281F31" stroke="#E1CDCB" strokeWidth="3" />
    <path d="M119 118L181 108V151L119 162Z" fill={`url(#${id}-glass)`} />
    <path d="M138 114V159M161 110V155M119 144L181 133" stroke="#4B3A47" strokeWidth="2" />
    <path d="M230 104L284 117V146L230 143Z" fill="#2D2337" stroke="#BB9DAA" strokeWidth="2" />
    <path d="M236 111L278 121V141L236 138Z" fill={`url(#${id}-glass)`} />
    <path d="M257 116V140" stroke="#483447" strokeWidth="2" />
    <path d="M95 153L219 150L304 154L179 190L83 164Z" fill="#4B3E4D" />
    <path d="M90 156L174 182L300 152" fill="none" stroke="#C2A7B1" strokeWidth="3" />
    <g fill="#1C252A"><ellipse cx="71" cy="159" rx="31" ry="17" /><ellipse cx="333" cy="153" rx="31" ry="17" /><ellipse cx="43" cy="183" rx="28" ry="19" /></g>
    <g fill="none" strokeLinecap="round"><path d="M49 177Q58 122 49 79M350 164Q342 104 355 63" stroke="#6E5866" strokeWidth="5" />
      <g stroke="#30383B" strokeWidth="9"><path d="M49 79Q13 65 4 85M49 79Q27 42 12 49M49 79Q66 46 91 55M49 79Q84 70 95 91M49 79Q40 52 48 38M355 63Q321 42 305 65M355 63Q344 33 328 28M355 63Q375 34 397 47M355 63Q385 61 400 82M355 63Q365 35 361 24" /></g>
    </g>
    <g fill={`url(#${id}-glow)`}><ellipse cx="96" cy="185" rx="35" ry="17" /><ellipse cx="320" cy="192" rx="38" ry="18" /><ellipse cx="145" cy="171" rx="53" ry="12" /></g>
    <g fill="#191420" stroke="#766079" strokeWidth="1"><path d="M94 164H99V188H94Z" /><path d="M317 170H322V197H317Z" /></g>
    <g fill="#FFE2B2"><rect x="94" y="164" width="5" height="5" rx="1" /><rect x="317" y="170" width="5" height="5" rx="1" /></g>
    <path d="M0 203L63 183L63 218L0 244Z" fill="#241D2C" stroke="#746477" />
    {[7, 18, 29, 40, 51].map((x) => <path key={x} d={`M${x} ${202 - x * .3}v34`} stroke="#A68FA6" strokeWidth="2" opacity=".6" />)}
    <path d="M365 187L400 200V237L365 220Z" fill="#241D2C" stroke="#746477" />
    <path d="M0 246L400 246" stroke="#D0A3FF" strokeOpacity=".12" />
  </svg>;
}
